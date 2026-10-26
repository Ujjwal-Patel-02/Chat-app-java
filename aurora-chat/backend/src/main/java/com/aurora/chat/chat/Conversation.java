package com.aurora.chat.chat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.aurora.chat.user.User;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

@Entity
@Table(name = "conversations")
public class Conversation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ConversationType type;

    /** Group name; null for direct conversations. */
    @Column(length = 80)
    private String name;

    /** "smallerUserId:largerUserId" for direct conversations, enforcing one DM per pair. */
    @Column(name = "direct_key", unique = true, length = 64)
    private String directKey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id")
    private User createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** Time of the latest activity; drives conversation ordering. */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "conversation", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<ConversationMember> members = new ArrayList<>();

    protected Conversation() {
    }

    private Conversation(ConversationType type, String name, String directKey, User createdBy) {
        this.type = type;
        this.name = name;
        this.directKey = directKey;
        this.createdBy = createdBy;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public static Conversation direct(String directKey, User createdBy) {
        return new Conversation(ConversationType.DIRECT, null, directKey, createdBy);
    }

    public static Conversation group(String name, User createdBy) {
        return new Conversation(ConversationType.GROUP, name, null, createdBy);
    }

    public ConversationMember addMember(User user) {
        ConversationMember member = new ConversationMember(this, user);
        members.add(member);
        return member;
    }

    public void touch(Instant when) {
        if (when != null && when.isAfter(updatedAt)) {
            updatedAt = when;
        }
    }

    /** Used by the demo-data seeder to backdate conversations. */
    public void setTimestamps(Instant createdAt, Instant updatedAt) {
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public Long getId() {
        return id;
    }

    public ConversationType getType() {
        return type;
    }

    public String getName() {
        return name;
    }

    public String getDirectKey() {
        return directKey;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<ConversationMember> getMembers() {
        return members;
    }
}
