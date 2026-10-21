package com.aurora.chat.security;

import java.util.Set;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

/**
 * Secures the STOMP channel:
 * <ul>
 *   <li>CONNECT must carry a valid {@code Authorization: Bearer <jwt>} header (browsers cannot send
 *       headers on the WebSocket handshake, so auth happens at the STOMP level);</li>
 *   <li>clients may only SUBSCRIBE to their private event queue and the public presence topic;</li>
 *   <li>clients may only SEND to application ({@code /app/**}) destinations, never straight to the
 *       broker, so nobody can spoof events into another user's queue.</li>
 * </ul>
 */
@Component
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private static final Set<String> ALLOWED_SUBSCRIPTIONS = Set.of("/user/queue/events", "/topic/presence");

    private final TokenAuthenticator authenticator;

    public StompAuthChannelInterceptor(TokenAuthenticator authenticator) {
        this.authenticator = authenticator;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }
        StompCommand command = accessor.getCommand();
        if (command == StompCommand.CONNECT || command == StompCommand.STOMP) {
            String header = accessor.getFirstNativeHeader("Authorization");
            if (header == null) {
                header = accessor.getFirstNativeHeader("authorization");
            }
            Authentication authentication = authenticator.authenticate(header)
                    .orElseThrow(() -> new MessageDeliveryException("Unauthorized: missing or invalid token"));
            accessor.setUser(authentication);
        } else if (command == StompCommand.SUBSCRIBE) {
            requireUser(accessor);
            String destination = accessor.getDestination();
            if (destination == null || !ALLOWED_SUBSCRIPTIONS.contains(destination)) {
                throw new MessageDeliveryException("Forbidden subscription: " + destination);
            }
        } else if (command == StompCommand.SEND) {
            requireUser(accessor);
            String destination = accessor.getDestination();
            if (destination == null || !destination.startsWith("/app/")) {
                throw new MessageDeliveryException("Forbidden destination: " + destination);
            }
        }
        return message;
    }

    private static void requireUser(StompHeaderAccessor accessor) {
        if (ChatPrincipal.from(accessor.getUser()) == null) {
            throw new MessageDeliveryException("Unauthorized");
        }
    }
}
