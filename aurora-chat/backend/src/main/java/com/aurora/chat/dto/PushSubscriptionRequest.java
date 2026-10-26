package com.aurora.chat.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Same shape as the browser's {@code PushSubscription.toJSON()}. */
public record PushSubscriptionRequest(
        @NotBlank @Size(max = 1000) String endpoint,
        @NotNull @Valid Keys keys) {

    public record Keys(@NotBlank @Size(max = 200) String p256dh, @NotBlank @Size(max = 100) String auth) {
    }
}
