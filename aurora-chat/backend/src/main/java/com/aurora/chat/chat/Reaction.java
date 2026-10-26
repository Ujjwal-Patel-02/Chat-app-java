package com.aurora.chat.chat;

import java.time.Instant;

import com.aurora.chat.user.User;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "message_reactions",
        uniqueConstraints = @UniqueConstraint(name = "uk_reaction_message_user_emoji",
                columnNames = {"message_id", "user_id", "emoji"}))
public class Reaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "message_id", nullable = false)
    private Message message;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 32)
    private String emoji;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Reaction() {
    }

    public Reaction(Message message, User user, String emoji) {
        this.message = message;
        this.user = user;
        this.emoji = emoji;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Message getMessage() {
        return message;
    }

    public User getUser() {
        return user;
    }

    public String getEmoji() {
        return emoji;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
