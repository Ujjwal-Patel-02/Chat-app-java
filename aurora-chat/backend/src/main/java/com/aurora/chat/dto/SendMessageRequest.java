package com.aurora.chat.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Text and/or up to 10 previously uploaded attachments ({@code POST /api/media}). */
public record SendMessageRequest(
        @Size(max = 4000, message = "Messages can be up to 4000 characters.")
        String content,
        Long replyToId,
        @Size(max = 64) String clientId,
        @Size(max = 10, message = "You can send up to 10 photos or videos at once.")
        List<@NotBlank @Size(max = 36) String> attachmentIds) {
}
