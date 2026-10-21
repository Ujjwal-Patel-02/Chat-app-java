package com.aurora.chat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SendMessageRequest(
        @NotBlank(message = "Messages can't be empty.")
        @Size(max = 4000, message = "Messages can be up to 4000 characters.")
        String content,
        Long replyToId,
        @Size(max = 64) String clientId) {
}
