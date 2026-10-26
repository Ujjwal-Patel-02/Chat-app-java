package com.aurora.chat.user;

import java.time.Instant;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import com.aurora.chat.chat.ChatEventPublisher;
import com.aurora.chat.dto.PresenceDto;
import com.aurora.chat.security.ChatPrincipal;

/** Broadcasts online/offline transitions on {@code /topic/presence}. */
@Component
public class PresenceEventListener {

    private final PresenceService presence;
    private final UserService userService;
    private final ChatEventPublisher events;

    public PresenceEventListener(PresenceService presence, UserService userService, ChatEventPublisher events) {
        this.presence = presence;
        this.userService = userService;
        this.events = events;
    }

    @EventListener
    public void onConnected(SessionConnectedEvent event) {
        ChatPrincipal principal = ChatPrincipal.from(event.getUser());
        String sessionId = SimpMessageHeaderAccessor.getSessionId(event.getMessage().getHeaders());
        if (principal == null || sessionId == null) {
            return;
        }
        if (presence.connected(principal.id(), sessionId)) {
            events.presence(new PresenceDto(principal.id(), true, null));
        }
    }

    @EventListener
    public void onDisconnected(SessionDisconnectEvent event) {
        ChatPrincipal principal = ChatPrincipal.from(event.getUser());
        if (principal == null) {
            return;
        }
        if (presence.disconnected(principal.id(), event.getSessionId())) {
            Instant now = Instant.now();
            userService.touchLastSeen(principal.id(), now);
            events.presence(new PresenceDto(principal.id(), false, now));
        }
    }
}
