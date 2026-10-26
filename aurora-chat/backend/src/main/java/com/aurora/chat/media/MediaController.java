package com.aurora.chat.media;

import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.aurora.chat.dto.AttachmentDto;
import com.aurora.chat.security.ChatPrincipal;

@RestController
@RequestMapping("/api/media")
public class MediaController {

    private final MediaService mediaService;

    public MediaController(MediaService mediaService) {
        this.mediaService = mediaService;
    }

    /** Upload a photo or video (multipart): {@code file}, optional {@code poster} + metadata. */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public AttachmentDto upload(@AuthenticationPrincipal ChatPrincipal me,
                                @RequestPart("file") MultipartFile file,
                                @RequestPart(name = "poster", required = false) MultipartFile poster,
                                @RequestParam(required = false) Integer width,
                                @RequestParam(required = false) Integer height,
                                @RequestParam(required = false) Long durationMs,
                                @RequestParam(required = false) String placeholder) {
        return mediaService.upload(me.id(), file, poster, width, height, durationMs, placeholder);
    }

    /** Public, capability-style URL (random id); img/video tags can't send auth headers. */
    @GetMapping("/{id}")
    public ResponseEntity<Resource> content(@PathVariable String id,
                                            @RequestParam(defaultValue = "false") boolean download) {
        return mediaService.serve(id, false, download);
    }

    @GetMapping("/{id}/thumbnail")
    public ResponseEntity<Resource> thumbnail(@PathVariable String id,
                                              @RequestParam(defaultValue = "false") boolean download) {
        return mediaService.serve(id, true, download);
    }
}
