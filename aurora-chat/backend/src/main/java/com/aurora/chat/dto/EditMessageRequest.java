package com.aurora.chat.dto;

import jakarta.validation.constraints.Size;

/** New text. May be empty only for messages with photos/videos (removes the caption). */
public record EditMessageRequest(
        @Size(max = 4000, message = "Messages can be up to 4000 characters.")
        String content) {
}
