package com.aurora.chat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PushEndpointRequest(@NotBlank @Size(max = 1000) String endpoint) {
}
