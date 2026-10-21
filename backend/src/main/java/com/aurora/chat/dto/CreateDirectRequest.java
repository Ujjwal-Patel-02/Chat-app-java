package com.aurora.chat.dto;

import jakarta.validation.constraints.NotNull;

public record CreateDirectRequest(@NotNull(message = "Choose who to message.") Long userId) {
}
