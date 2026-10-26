package com.aurora.chat.config;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.aurora.chat.chat.Conversation;
import com.aurora.chat.chat.ConversationMember;
import com.aurora.chat.chat.ConversationRepository;
import com.aurora.chat.chat.Message;
import com.aurora.chat.chat.MessageRepository;
import com.aurora.chat.chat.Reaction;
import com.aurora.chat.user.User;
import com.aurora.chat.user.UserRepository;

/**
 * Optional demo content (APP_DEMO_DATA_ENABLED=true) so a fresh install has people, groups,
 * replies and reactions to explore. Runs only when the database has no users.
 * Every demo account uses the password {@value #DEMO_PASSWORD}.
 */
@Component
@ConditionalOnProperty(prefix = "app.demo-data", name = "enabled", havingValue = "true")
public class DemoDataSeeder implements ApplicationRunner {

    public static final String DEMO_PASSWORD = "password123";
    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    private final UserRepository users;
    private final ConversationRepository conversations;
    private final MessageRepository messages;
    private final PasswordEncoder passwordEncoder;

    public DemoDataSeeder(UserRepository users, ConversationRepository conversations, MessageRepository messages,
                          PasswordEncoder passwordEncoder) {
        this.users = users;
        this.conversations = conversations;
        this.messages = messages;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (users.count() > 0) {
            log.info("Demo data skipped: the database already has users.");
            return;
        }
        String hash = passwordEncoder.encode(DEMO_PASSWORD);
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        Instant created = now.minus(Duration.ofDays(14));

        User alex = user("alex", "Alex Rivera", hash, created);
        User maya = user("maya", "Maya Patel", hash, created);
        User leo = user("leo", "Leo Martins", hash, created);
        User aisha = user("aisha", "Aisha Khan", hash, created);
        User kenji = user("kenji", "Kenji Watanabe", hash, created);
        User sofia = user("sofia", "Sofia Rossi", hash, created);
        for (User u : List.of(maya, leo, aisha, kenji, sofia)) {
            u.setLastSeenAt(now.minus(Duration.ofMinutes(5L + u.getUsername().length() * 7L)));
        }

        // --- Group: Launch Squad -------------------------------------------------------------
        Conversation launch = group("🚀 Launch Squad", alex, List.of(alex, maya, leo, aisha, kenji));
        Instant y = now.minus(Duration.ofDays(1)).minus(Duration.ofHours(2));
        Message l1 = msg(launch, maya, "Morning team! The new onboarding flow is live on staging 🎉", null, y);
        msg(launch, leo, "Just tried it — the dark mode transition is buttery smooth.", null, y.plusSeconds(240));
        Message l3 = msg(launch, aisha, "Can we ship emoji reactions in the same release?", null, y.plusSeconds(600));
        Instant t = now.minus(Duration.ofMinutes(95));
        Message l4 = msg(launch, kenji, "Reactions are merged ✅ Replies too — hover any message and hit reply.", null, t);
        Message l5 = msg(launch, alex, "Yes! Both are in. Let's do a final QA pass at 3 PM.", l3, t.plusSeconds(180));
        Message l6 = msg(launch, maya, "Perfect. I'll prep the release notes ✍️", null, t.plusSeconds(420));
        Message l7 = msg(launch, leo, "Add a clip of the aurora background, it's gorgeous 🌌", l6, t.plusSeconds(600));
        Message l8 = msg(launch, kenji, "QA checklist is pinned in the doc. Ping me if anything looks off 👀", null,
                t.plusSeconds(900));
        react(l1, leo, "🎉");
        react(l1, kenji, "🎉");
        react(l4, maya, "🔥");
        react(l4, alex, "🔥");
        react(l4, aisha, "🔥");
        react(l4, leo, "🎉");
        react(l5, maya, "👍");
        react(l5, kenji, "👍");
        react(l7, alex, "😂");
        react(l7, aisha, "❤️");
        finish(launch, created.plus(Duration.ofDays(2)), l8, List.of(alex, maya, leo, aisha, kenji), l8);

        // --- DM: Alex <-> Maya -----------------------------------------------------------------
        Conversation dmMaya = direct(alex, maya);
        Instant d = now.minus(Duration.ofMinutes(40));
        msg(dmMaya, maya, "Hey Alex! Do you have a minute to review the new color palette?", null, d);
        msg(dmMaya, alex, "Sure! Send it over 🎨", null, d.plusSeconds(60));
        Message p3 = msg(dmMaya, maya, "Violet → indigo → cyan for gradients, frosted glass on top.", null,
                d.plusSeconds(150));
        Message p4 = msg(dmMaya, alex, "Love it. Maybe a slightly softer cyan in light mode?", p3, d.plusSeconds(260));
        Message p5 = msg(dmMaya, maya, "Good call — updating it now 🙌", p4, d.plusSeconds(330));
        react(p3, alex, "😍");
        react(p5, alex, "❤️");
        finish(dmMaya, created.plus(Duration.ofDays(3)), p5, List.of(alex, maya), p5);

        // --- DM: Alex <-> Sofia (unread for Alex) ---------------------------------------------
        Conversation dmSofia = direct(alex, sofia);
        Instant s = now.minus(Duration.ofMinutes(12));
        msg(dmSofia, sofia, "Are we still on for the design sync tomorrow?", null, s);
        Message s2 = msg(dmSofia, sofia, "I booked the big room with the good whiteboard 🙂", null, s.plusSeconds(45));
        finish(dmSofia, created.plus(Duration.ofDays(4)), s2, List.of(sofia), s2);

        // --- Group: Design Crew ----------------------------------------------------------------
        Conversation design = group("Design Crew", sofia, List.of(sofia, alex, maya, aisha));
        Instant g = now.minus(Duration.ofDays(2)).minus(Duration.ofHours(3));
        msg(design, sofia, "Welcome to the crew! Sharing all the UI explorations here.", null, g);
        Message g2 = msg(design, aisha, "Uploaded the new icon set ✨", null, g.plusSeconds(3600));
        react(g2, sofia, "💯");
        finish(design, created.plus(Duration.ofDays(5)), g2, List.of(sofia, alex, maya, aisha), g2);

        // --- DM: Alex <-> Leo ------------------------------------------------------------------
        Conversation dmLeo = direct(alex, leo);
        Instant o = now.minus(Duration.ofDays(3));
        msg(dmLeo, alex, "Thanks for the thorough code review!", null, o);
        Message o2 = msg(dmLeo, leo, "Anytime 🙌 The WebSocket reconnect logic looks solid.", null, o.plusSeconds(300));
        react(o2, alex, "🙏");
        finish(dmLeo, created.plus(Duration.ofDays(6)), o2, List.of(alex, leo), o2);

        log.info("Seeded demo data: 6 users (password '{}'), 5 conversations.", DEMO_PASSWORD);
    }

    private User user(String username, String displayName, String hash, Instant createdAt) {
        User user = new User(username, displayName, hash);
        user.setCreatedAt(createdAt);
        return users.save(user);
    }

    private Conversation group(String name, User creator, List<User> participants) {
        Conversation conversation = Conversation.group(name, creator);
        participants.forEach(conversation::addMember);
        return conversations.save(conversation);
    }

    private Conversation direct(User a, User b) {
        String key = Math.min(a.getId(), b.getId()) + ":" + Math.max(a.getId(), b.getId());
        Conversation conversation = Conversation.direct(key, a);
        conversation.addMember(a);
        conversation.addMember(b);
        return conversations.save(conversation);
    }

    private Message msg(Conversation conversation, User sender, String text, Message replyTo, Instant at) {
        return messages.save(new Message(conversation, sender, text, replyTo, at));
    }

    private static void react(Message message, User user, String emoji) {
        message.getReactions().add(new Reaction(message, user, emoji));
    }

    /** Backdates the conversation and marks it read up to {@code readUpTo} for the given members. */
    private static void finish(Conversation conversation, Instant createdAt, Message last, List<User> readers,
                               Message readUpTo) {
        conversation.setTimestamps(createdAt, last.getCreatedAt());
        for (ConversationMember member : conversation.getMembers()) {
            if (readers.stream().anyMatch(r -> r.getId().equals(member.getUser().getId()))) {
                member.setLastReadMessageId(readUpTo.getId());
            }
        }
    }
}
