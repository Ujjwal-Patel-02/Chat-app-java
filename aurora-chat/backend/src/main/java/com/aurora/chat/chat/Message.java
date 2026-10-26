package com.aurora.chat.chat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.aurora.chat.media.Attachment;
import com.aurora.chat.user.User;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

@Entity
@Table(name = "messages", indexes = @Index(name = "idx_messages_conversation", columnList = "conversation_id, id"))
public class Message {

    public static final int MAX_LENGTH = 4000;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "conversation_id", nullable = false)
    private Conversation conversation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sender_id", nullable = false)
    private User sender;

    /** Null once the message is deleted. */
    @Column(length = MAX_LENGTH)
    private String content;

    /** The message this one replies to (quoted reply), if any. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reply_to_id")
    private Message replyTo;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "edited_at")
    private Instant editedAt;

    @Column(nullable = false)
    private boolean deleted;

    @OneToMany(mappedBy = "message", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<Reaction> reactions = new ArrayList<>();

    /** Photos/videos, managed by MediaService. */
    @OneToMany(mappedBy = "message")
    @OrderBy("position ASC")
    private List<Attachment> attachments = new ArrayList<>();

    protected Message() {
    }

    public Message(Conversation conversation, User sender, String content, Message replyTo) {
        this(conversation, sender, content, replyTo, Instant.now());
    }

    public Message(Conversation conversation, User sender, String content, Message replyTo, Instant createdAt) {
        this.conversation = conversation;
        this.sender = sender;
        this.content = content;
        this.replyTo = replyTo;
        this.createdAt = createdAt;
    }

    public boolean hasAttachments() {
        return !attachments.isEmpty();
    }

    public void edit(String newContent) {
        this.content = newContent;
        this.editedAt = Instant.now();
    }

    public void markDeleted() {
        this.deleted = true;
        this.content = null;
        this.reactions.clear();
    }

    public Long getId() {
        return id;
    }

    public Conversation getConversation() {
        return conversation;
    }

    public User getSender() {
        return sender;
    }

    public String getContent() {
        return content;
    }

    public Message getReplyTo() {
        return replyTo;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getEditedAt() {
        return editedAt;
    }

    public boolean isDeleted() {
        return deleted;
    }

    public List<Reaction> getReactions() {
        return reactions;
    }

    public List<Attachment> getAttachments() {
        return attachments;
    }
}
