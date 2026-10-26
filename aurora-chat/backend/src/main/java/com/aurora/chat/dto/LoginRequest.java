package com.aurora.chat.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "Enter your username.") String username,
        @NotBlank(message = "Enter your password.") String password) {
}
