package com.aurora.chat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank(message = "Pick a username.")
        @Size(min = 3, max = 20, message = "Usernames are 3-20 characters long.")
        @Pattern(regexp = "^@?[A-Za-z0-9_.]+$", message = "Usernames may only contain letters, numbers, dots and underscores.")
        String username,
        @NotBlank(message = "Tell us your name.")
        @Size(max = 40, message = "Display names can be up to 40 characters.")
        String displayName,
        @NotBlank(message = "Choose a password.")
        @Size(min = 6, max = 100, message = "Passwords need at least 6 characters.")
        String password) {
}
