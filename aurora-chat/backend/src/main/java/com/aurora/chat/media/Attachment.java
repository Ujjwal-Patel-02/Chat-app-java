package com.aurora.chat.media;

import java.time.Instant;

import com.aurora.chat.chat.Message;
import com.aurora.chat.user.User;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * A photo or video. Uploaded first (unattached), then linked to a message when it is sent.
 * The id is a random UUID, which doubles as an unguessable capability in media URLs.
 */
@Entity
@Table(name = "attachments", indexes = {
        @Index(name = "idx_attachments_message", columnList = "message_id"),
        @Index(name = "idx_attachments_created", columnList = "created_at")})
public class Attachment {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "message_id")
    private Message message;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "uploader_id", nullable = false)
    private User uploader;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private MediaKind kind;

    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    private Integer width;

    private Integer height;

    @Column(name = "duration_ms")
    private Long durationMs;

    @Column(name = "storage_key", nullable = false, length = 300)
    private String storageKey;

    @Column(nullable = false, length = 1000)
    private String url;

    @Column(name = "thumbnail_key", length = 300)
    private String thumbnailKey;

    @Column(name = "thumbnail_url", length = 1000)
    private String thumbnailUrl;

    /** Tiny blurred preview (data: URL) shown while the real file loads. */
    @Column(length = 4000)
    private String placeholder;

    @Column(name = "original_name", length = 160)
    private String originalName;

    @Column(nullable = false)
    private int position;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Attachment() {
    }

    public Attachment(String id, User uploader, MediaKind kind, String mimeType, long sizeBytes) {
        this.id = id;
        this.uploader = uploader;
        this.kind = kind;
        this.mimeType = mimeType;
        this.sizeBytes = sizeBytes;
        this.createdAt = Instant.now();
    }

    public void attachTo(Message message, int position) {
        this.message = message;
        this.position = position;
    }

    public String getId() { return id; }
    public Message getMessage() { return message; }
    public User getUploader() { return uploader; }
    public MediaKind getKind() { return kind; }
    public String getMimeType() { return mimeType; }
    public long getSizeBytes() { return sizeBytes; }
    public Integer getWidth() { return width; }
    public Integer getHeight() { return height; }
    public Long getDurationMs() { return durationMs; }
    public String getStorageKey() { return storageKey; }
    public String getUrl() { return url; }
    public String getThumbnailKey() { return thumbnailKey; }
    public String getThumbnailUrl() { return thumbnailUrl; }
    public String getPlaceholder() { return placeholder; }
    public String getOriginalName() { return originalName; }
    public int getPosition() { return position; }
    public Instant getCreatedAt() { return createdAt; }

    public void setStored(String storageKey, String url) {
        this.storageKey = storageKey;
        this.url = url;
    }

    public void setThumbnail(String thumbnailKey, String thumbnailUrl) {
        this.thumbnailKey = thumbnailKey;
        this.thumbnailUrl = thumbnailUrl;
    }

    public void setDimensions(Integer width, Integer height, Long durationMs) {
        this.width = width;
        this.height = height;
        this.durationMs = durationMs;
    }

    public void setPlaceholder(String placeholder) { this.placeholder = placeholder; }
    public void setOriginalName(String originalName) { this.originalName = originalName; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
