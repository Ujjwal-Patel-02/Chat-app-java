package com.aurora.chat.chat;

import java.security.Principal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import com.aurora.chat.dto.TypingRequest;
import com.aurora.chat.security.ChatPrincipal;

/** Ephemeral typing indicators over STOMP: clients send to {@code /app/conversations/{id}/typing}. */
@Controller
public class TypingController {

    private static final Logger log = LoggerFactory.getLogger(TypingController.class);

    private final ConversationService conversationService;

    public TypingController(ConversationService conversationService) {
        this.conversationService = conversationService;
    }

    @MessageMapping("/conversations/{conversationId}/typing")
    public void typing(@DestinationVariable Long conversationId, @Payload TypingRequest request, Principal principal) {
        ChatPrincipal me = ChatPrincipal.from(principal);
        if (me != null && request != null) {
            conversationService.broadcastTyping(me.id(), conversationId, request.typing());
        }
    }

    @MessageExceptionHandler
    public void handleError(Exception ex) {
        log.debug("Ignoring invalid typing signal: {}", ex.getMessage());
    }
}
