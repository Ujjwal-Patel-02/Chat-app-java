package com.aurora.chat.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Instant;
import java.util.Base64;

import org.junit.jupiter.api.Test;

class WebPushCryptoTest {

    /** Vector produced by the independent Node.js http_ece library (used by the "web-push" npm package). */
    @Test
    void matchesNodeReferenceImplementation() {
        ECPrivateKey asPrivate = EcKeys.decodePrivate(EcKeys.fromB64("WSGoW324kESaNDHGhPgwXS59qMYYu5-KceUwfdmdtP8"));
        ECPublicKey asPublic = EcKeys.decodePublic(EcKeys.fromB64("BDqX_af1QHMc8BF9-4YRHDGZVaDNLJSgMZH2bfrH1P9ksbTaOQZPD1vsDPwAtF_qwVmMp3TaDH_tGdASersS3tM"));
        byte[] body = WebPushCrypto.encrypt(
                "{\"title\":\"Maya Patel\",\"body\":\"Hello from Node 👋\",\"conversationId\":7}".getBytes(StandardCharsets.UTF_8),
                EcKeys.fromB64("BKHT2rQ-QBoCeVdnEJV4j1sv7Ra7xKle8gwC0S5SDjxsKLMAo6NeFOQCZCctUmVZYNUm3Z28RNr-Qe6LXmvryOc"),
                EcKeys.fromB64("fbo_xLjr9EqHQfSgIdGUoQ"),
                new KeyPair(asPublic, asPrivate),
                EcKeys.fromB64("gL4p3BjGrRlT-QiiRx1Zkw"));
        assertThat(EcKeys.b64url(body)).isEqualTo(
                "gL4p3BjGrRlT-QiiRx1ZkwAAEABBBDqX_af1QHMc8BF9-4YRHDGZVaDNLJSgMZH2bfrH1P9ksbTaOQZPD1vsDPwAtF_qwVmMp3TaDH_tGdASersS3tMVQRijpPJvIe-OisWbBQlOUSRj8aoLdCh-RL2P1OUT1aIs4GkkpHAGiL2U1T7b3rWP25C1qNVtaUkVWQL7GQucJQkTyadVdJ3ql7wodM3dxl83An6H4xqb");
    }

    @Test
    void roundTripsWithFreshKeys() throws Exception {
        KeyPair ua = EcKeys.generate();
        byte[] auth = new byte[16];
        new java.security.SecureRandom().nextBytes(auth);
        byte[] plaintext = "{\"hello\":\"world 🌍\"}".getBytes(StandardCharsets.UTF_8);
        byte[] body = WebPushCrypto.encrypt(plaintext, EcKeys.encodePublic((ECPublicKey) ua.getPublic()), auth);
        assertThat(PushTestSupport.decrypt(body, ua, auth)).isEqualTo(plaintext);
    }

    @Test
    void vapidJwtIsAValidEs256Token() throws Exception {
        KeyPair keys = EcKeys.generate();
        Instant now = Instant.parse("2026-10-26T10:00:00Z");
        String jwt = WebPushCrypto.vapidJwt("https://fcm.googleapis.com", "mailto:ops@example.com",
                (ECPrivateKey) keys.getPrivate(), now);
        String[] parts = jwt.split("\\.");
        assertThat(parts).hasSize(3);
        String header = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
        String claims = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
        assertThat(header).contains("\"alg\":\"ES256\"");
        assertThat(claims).contains("\"aud\":\"https://fcm.googleapis.com\"")
                .contains("\"sub\":\"mailto:ops@example.com\"")
                .contains("\"exp\":" + (now.getEpochSecond() + 12 * 3600));
        Signature verifier = Signature.getInstance("SHA256withECDSAinP1363Format");
        verifier.initVerify(keys.getPublic());
        verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(verifier.verify(Base64.getUrlDecoder().decode(parts[2]))).isTrue();
    }

    @Test
    void keyEncodingRoundTrips() {
        KeyPair keys = EcKeys.generate();
        byte[] pub = EcKeys.encodePublic((ECPublicKey) keys.getPublic());
        byte[] priv = EcKeys.encodePrivate((ECPrivateKey) keys.getPrivate());
        assertThat(pub).hasSize(65);
        assertThat(priv).hasSize(32);
        assertThat(EcKeys.encodePublic(EcKeys.decodePublic(pub))).isEqualTo(pub);
        assertThat(EcKeys.encodePrivate(EcKeys.decodePrivate(priv))).isEqualTo(priv);
    }
}
