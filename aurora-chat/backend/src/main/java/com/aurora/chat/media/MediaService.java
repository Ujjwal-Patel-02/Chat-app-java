package com.aurora.chat.media;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.task.TaskExecutor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import com.aurora.chat.chat.Message;
import com.aurora.chat.common.ApiException;
import com.aurora.chat.common.DtoMapper;
import com.aurora.chat.config.AppProperties;
import com.aurora.chat.dto.AttachmentDto;
import com.aurora.chat.dto.MediaItemDto;
import com.aurora.chat.user.User;
import com.aurora.chat.user.UserRepository;

@Service
public class MediaService {

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);
    private static final int MAX_POSTER_BYTES = 2 * 1024 * 1024;
    private static final int MAX_ATTACHMENTS = 10;
    private static final Pattern PLACEHOLDER = Pattern.compile("^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$");

    private final AttachmentRepository attachments;
    private final UserRepository users;
    private final MediaStorage storage;
    private final DtoMapper mapper;
    private final AppProperties.Media config;
    private final TaskExecutor backgroundExecutor;

    public MediaService(AttachmentRepository attachments, UserRepository users, MediaStorage storage, DtoMapper mapper,
                        AppProperties properties, TaskExecutor backgroundExecutor) {
        this.attachments = attachments;
        this.users = users;
        this.storage = storage;
        this.mapper = mapper;
        this.config = properties.media();
        this.backgroundExecutor = backgroundExecutor;
    }

    /** Stores an uploaded photo/video (and the client-generated video poster) as an unattached attachment. */
    public AttachmentDto upload(Long userId, MultipartFile file, MultipartFile poster, Integer width, Integer height,
                                Long durationMs, String placeholder) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Choose a photo or video to share.");
        }
        User uploader = users.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Please sign in again."));
        Path upload = null;
        Path posterFile = null;
        List<String> storedKeys = new ArrayList<>();
        try {
            upload = Files.createTempFile("aurora-upload-", ".bin");
            file.transferTo(upload);
            MediaTypeSniffer.Detected type = MediaTypeSniffer.sniff(upload).orElseThrow(() -> new ApiException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Only photos (JPEG, PNG, GIF, WebP, AVIF) and videos (MP4, MOV, WebM) can be shared."));
            if (type.heic()) {
                throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                        "HEIC photos can't be shown in most browsers. Please share it as a JPEG.");
            }
            long size = Files.size(upload);
            int limitMb = type.kind() == MediaKind.IMAGE ? config.maxImageMb() : config.maxVideoMb();
            if (size > limitMb * 1024L * 1024L) {
                throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, (type.kind() == MediaKind.IMAGE ? "Photos" : "Videos")
                        + " can be up to " + limitMb + " MB.");
            }

            String id = UUID.randomUUID().toString();
            StoredFile stored = storage.store(id + type.extension(), upload, type.mimeType(), type.kind() == MediaKind.VIDEO);
            storedKeys.add(stored.storageKey());

            Attachment attachment = new Attachment(id, uploader, type.kind(), type.mimeType(), size);
            attachment.setStored(stored.storageKey(), stored.publicUrl() != null ? stored.publicUrl() : "/api/media/" + id);

            if (poster != null && !poster.isEmpty()) {
                if (poster.getSize() > MAX_POSTER_BYTES) {
                    throw ApiException.badRequest("The preview image is too large.");
                }
                posterFile = Files.createTempFile("aurora-poster-", ".bin");
                poster.transferTo(posterFile);
                MediaTypeSniffer.Detected posterType = MediaTypeSniffer.sniff(posterFile)
                        .filter(t -> t.kind() == MediaKind.IMAGE && !t.heic() && !t.mimeType().equals("image/gif"))
                        .orElseThrow(() -> ApiException.badRequest("The preview must be a JPEG, PNG or WebP image."));
                StoredFile thumb = storage.store(id + "-thumb" + posterType.extension(), posterFile, posterType.mimeType(), false);
                storedKeys.add(thumb.storageKey());
                attachment.setThumbnail(thumb.storageKey(),
                        thumb.publicUrl() != null ? thumb.publicUrl() : "/api/media/" + id + "/thumbnail");
            }

            attachment.setDimensions(clamp(width, 1, 20_000), clamp(height, 1, 20_000),
                    durationMs == null || durationMs < 0 || durationMs > 86_400_000L ? null : durationMs);
            if (placeholder != null && placeholder.length() <= 4000 && PLACEHOLDER.matcher(placeholder).matches()) {
                attachment.setPlaceholder(placeholder);
            }
            attachment.setOriginalName(cleanName(file.getOriginalFilename()));
            attachments.save(attachment);
            return mapper.attachment(attachment);
        } catch (IOException e) {
            storedKeys.forEach(storage::delete);
            log.warn("Upload failed", e);
            throw new ApiException(HttpStatus.BAD_GATEWAY, "The upload failed. Please try again.");
        } catch (RuntimeException e) {
            storedKeys.forEach(storage::delete);
            throw e;
        } finally {
            deleteQuietly(upload);
            deleteQuietly(posterFile);
        }
    }

    /** Links freshly uploaded attachments (owned by the sender, not yet used) to a new message, in order. */
    @Transactional
    public void attach(List<String> ids, Message message, Long userId) {
        List<String> unique = new ArrayList<>(new LinkedHashSet<>(ids));
        if (unique.size() > MAX_ATTACHMENTS) {
            throw ApiException.badRequest("You can send up to " + MAX_ATTACHMENTS + " photos or videos at once.");
        }
        Map<String, Attachment> found = attachments.findAllById(unique).stream()
                .collect(Collectors.toMap(Attachment::getId, Function.identity()));
        int position = 0;
        for (String id : unique) {
            Attachment attachment = found.get(id);
            if (attachment == null) {
                throw ApiException.badRequest("A photo or video is no longer available. Please add it again.");
            }
            if (!attachment.getUploader().getId().equals(userId)) {
                throw ApiException.forbidden("You can only send photos and videos you uploaded.");
            }
            if (attachment.getMessage() != null) {
                throw ApiException.badRequest("That photo or video was already sent.");
            }
            attachment.attachTo(message, position++);
            message.getAttachments().add(attachment);
        }
    }

    /** Removes a deleted message's files. Storage deletion happens after the transaction commits. */
    @Transactional
    public void deleteForMessage(Message message) {
        List<Attachment> list = new ArrayList<>(message.getAttachments());
        if (list.isEmpty()) {
            return;
        }
        List<String> keys = new ArrayList<>();
        for (Attachment attachment : list) {
            keys.add(attachment.getStorageKey());
            if (attachment.getThumbnailKey() != null) {
                keys.add(attachment.getThumbnailKey());
            }
        }
        message.getAttachments().clear();
        attachments.deleteAll(list);
        afterCommit(() -> backgroundExecutor.execute(() -> keys.forEach(storage::delete)));
    }

    @Transactional(readOnly = true)
    public List<MediaItemDto> conversationMedia(Long conversationId, Long beforeMessageId, int limit) {
        PageRequest page = PageRequest.of(0, Math.max(1, Math.min(limit, 100)));
        List<Attachment> found = beforeMessageId == null
                ? attachments.findConversationMedia(conversationId, page)
                : attachments.findConversationMediaBefore(conversationId, beforeMessageId, page);
        return found.stream()
                .map(a -> new MediaItemDto(mapper.attachment(a), a.getMessage().getId(),
                        mapper.summary(a.getMessage().getSender()), a.getMessage().getCreatedAt()))
                .toList();
    }

    private static final DateTimeFormatter FILE_STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    /** Download name like {@code aurora-20261026-153812-1a2b.jpg} (neutral: never exposes the sender's file name). */
    static String downloadName(Attachment attachment) {
        Instant when = attachment.getMessage() != null ? attachment.getMessage().getCreatedAt() : attachment.getCreatedAt();
        return "aurora-" + FILE_STAMP.format(when) + "-" + attachment.getId().substring(0, 4);
    }

    static String extensionFor(String mimeType) {
        return switch (mimeType) {
            case "image/png" -> ".png";
            case "image/gif" -> ".gif";
            case "image/webp" -> ".webp";
            case "image/avif" -> ".avif";
            case "video/mp4" -> ".mp4";
            case "video/quicktime" -> ".mov";
            case "video/webm" -> ".webm";
            default -> ".jpg";
        };
    }

    /** Streams a locally stored file (HTTP range requests are handled by Spring for video seeking). */
    @Transactional(readOnly = true)
    public ResponseEntity<Resource> serve(String id, boolean thumbnail) {
        return serve(id, thumbnail, false);
    }

    /**
     * {@code download=true} makes browsers save the file ("Content-Disposition: attachment") instead of showing it.
     * Cloudinary files are redirected to Cloudinary with its {@code fl_attachment} flag, which does the same.
     */
    @Transactional(readOnly = true)
    public ResponseEntity<Resource> serve(String id, boolean thumbnail, boolean download) {
        Attachment attachment = attachments.findById(id).orElseThrow(() -> ApiException.notFound("Media not found."));
        String key = thumbnail ? attachment.getThumbnailKey() : attachment.getStorageKey();
        String url = thumbnail ? attachment.getThumbnailUrl() : attachment.getUrl();
        if (key == null || url == null) {
            throw ApiException.notFound("Media not found.");
        }
        Resource resource = storage.load(key);
        String mime = thumbnail ? guessThumbnailType(key) : attachment.getMimeType();
        String fileName = downloadName(attachment) + (thumbnail ? "-preview" : "") + extensionFor(mime);
        if (resource == null) {
            if (url.startsWith("http")) {
                String location = download ? CloudinaryMediaStorage.attachmentUrl(url, fileName.substring(0, fileName.lastIndexOf('.'))) : url;
                return ResponseEntity.status(HttpStatus.FOUND).location(java.net.URI.create(location)).build();
            }
            throw ApiException.notFound("Media not found.");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mime))
                .cacheControl(CacheControl.maxAge(java.time.Duration.ofDays(365)).cachePublic().immutable())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'; sandbox")
                .header("Cross-Origin-Resource-Policy", "cross-origin")
                .header(HttpHeaders.CONTENT_DISPOSITION, (download ? ContentDisposition.attachment() : ContentDisposition.inline())
                        .filename(fileName)
                        .build().toString())
                .header(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, HttpHeaders.CONTENT_DISPOSITION)
                .body(resource);
    }

    /** Deletes uploads that were never sent (e.g. the user removed them before sending). */
    @Scheduled(initialDelayString = "PT10M", fixedDelayString = "PT1H")
    public void cleanUpOrphans() {
        Instant cutoff = Instant.now().minus(config.orphanTtl());
        List<Attachment> orphans = attachments.findByMessageIsNullAndCreatedAtBefore(cutoff);
        for (Attachment orphan : orphans) {
            storage.delete(orphan.getStorageKey());
            if (orphan.getThumbnailKey() != null) {
                storage.delete(orphan.getThumbnailKey());
            }
            attachments.delete(orphan);
        }
        if (!orphans.isEmpty()) {
            log.info("Removed {} unsent upload(s)", orphans.size());
        }
    }

    private static String guessThumbnailType(String key) {
        if (key.endsWith(".png")) return "image/png";
        if (key.endsWith(".webp")) return "image/webp";
        return "image/jpeg";
    }

    private static Integer clamp(Integer value, int min, int max) {
        return value == null || value < min || value > max ? null : value;
    }

    private static String cleanName(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        String base = name.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}\"]", "").trim();
        return base.isEmpty() ? null : base.length() > 120 ? base.substring(base.length() - 120) : base;
    }

    private static void deleteQuietly(Path path) {
        if (path != null) {
            try {
                Files.deleteIfExists(path);
            } catch (IOException ignored) {
                // temp file; the OS cleans up eventually
            }
        }
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }
}
