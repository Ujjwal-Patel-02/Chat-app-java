package com.aurora.chat.chat;

import java.util.Collection;
import java.util.List;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.aurora.chat.dto.ChatEvent;
import com.aurora.chat.dto.PresenceDto;

/**
 * Pushes events to connected clients. When called inside a transaction, delivery is deferred until
 * the transaction commits, so clients never see data that is later rolled back.
 */
@Component
public class ChatEventPublisher {

    public static final String USER_EVENTS_DESTINATION = "/queue/events";
    public static final String PRESENCE_TOPIC = "/topic/presence";

    private final SimpMessagingTemplate messagingTemplate;

    public ChatEventPublisher(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public void toUsers(Collection<Long> userIds, ChatEvent event) {
        List<Long> recipients = List.copyOf(userIds);
        afterCommit(() -> recipients.forEach(userId ->
                messagingTemplate.convertAndSendToUser(String.valueOf(userId), USER_EVENTS_DESTINATION, event)));
    }

    public void presence(PresenceDto presence) {
        afterCommit(() -> messagingTemplate.convertAndSend(PRESENCE_TOPIC, presence));
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }
}
