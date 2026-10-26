package com.aurora.chat.user;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.stereotype.Service;

/**
 * In-memory presence tracking: a user is online while at least one WebSocket session is open
 * (several tabs or devices count once). Single-instance by design, which suits free hosting.
 */
@Service
public class PresenceService {

    private final ConcurrentHashMap<Long, Set<String>> sessionsByUser = new ConcurrentHashMap<>();

    public boolean isOnline(Long userId) {
        Set<String> sessions = sessionsByUser.get(userId);
        return sessions != null && !sessions.isEmpty();
    }

    /** @return true when this connection brought the user online */
    public boolean connected(Long userId, String sessionId) {
        AtomicBoolean cameOnline = new AtomicBoolean(false);
        sessionsByUser.compute(userId, (id, sessions) -> {
            Set<String> set = sessions != null ? sessions : ConcurrentHashMap.newKeySet();
            if (set.isEmpty()) {
                cameOnline.set(true);
            }
            set.add(sessionId);
            return set;
        });
        return cameOnline.get();
    }

    /** @return true when the user's last session closed */
    public boolean disconnected(Long userId, String sessionId) {
        AtomicBoolean wentOffline = new AtomicBoolean(false);
        sessionsByUser.computeIfPresent(userId, (id, sessions) -> {
            if (!sessions.remove(sessionId)) {
                return sessions;
            }
            if (sessions.isEmpty()) {
                wentOffline.set(true);
                return null;
            }
            return sessions;
        });
        return wentOffline.get();
    }
}
