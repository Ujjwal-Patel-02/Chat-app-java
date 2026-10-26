package com.aurora.chat.dto;

import jakarta.validation.constraints.NotNull;

public record MarkReadRequest(@NotNull Long messageId) {
}
