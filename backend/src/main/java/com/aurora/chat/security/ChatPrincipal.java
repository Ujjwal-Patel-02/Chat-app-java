package com.aurora.chat.security;

import java.io.Serializable;
import java.security.Principal;

import org.springframework.security.core.Authentication;

/**
 * The authenticated user attached to HTTP requests and WebSocket sessions.
 * {@link #getName()} returns the user id, which is also the key for STOMP user destinations
 * ({@code /user/queue/events}).
 */
public record ChatPrincipal(Long id, String username) implements Principal, Serializable {

    @Override
    public String getName() {
        return String.valueOf(id);
    }

    public static ChatPrincipal from(Principal principal) {
        if (principal instanceof ChatPrincipal chatPrincipal) {
            return chatPrincipal;
        }
        if (principal instanceof Authentication authentication
                && authentication.getPrincipal() instanceof ChatPrincipal chatPrincipal) {
            return chatPrincipal;
        }
        return null;
    }
}
