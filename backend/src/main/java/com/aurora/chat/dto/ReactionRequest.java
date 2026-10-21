package com.aurora.chat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ReactionRequest(@NotBlank(message = "Pick an emoji.") @Size(max = 32) String emoji) {
}
