package com.aurora.chat.push;

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

/** One browser/device that agreed to receive notifications for a user. */
@Entity
@Table(name = "push_subscriptions")
public class PushSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, unique = true, length = 1000)
    private String endpoint;

    /** Browser's ECDH P-256 public key (base64url). */
    @Column(nullable = false, length = 200)
    private String p256dh;

    /** Browser's 16-byte auth secret (base64url). */
    @Column(nullable = false, length = 100)
    private String auth;

    @Column(name = "user_agent", length = 300)
    private String userAgent;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PushSubscription() {
    }

    public PushSubscription(User user, String endpoint, String p256dh, String auth, String userAgent) {
        this.user = user;
        this.endpoint = endpoint;
        update(user, p256dh, auth, userAgent);
        this.createdAt = Instant.now();
    }

    public void update(User user, String p256dh, String auth, String userAgent) {
        this.user = user;
        this.p256dh = p256dh;
        this.auth = auth;
        this.userAgent = userAgent == null ? null : userAgent.length() > 300 ? userAgent.substring(0, 300) : userAgent;
    }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public String getEndpoint() { return endpoint; }
    public String getP256dh() { return p256dh; }
    public String getAuth() { return auth; }
}
