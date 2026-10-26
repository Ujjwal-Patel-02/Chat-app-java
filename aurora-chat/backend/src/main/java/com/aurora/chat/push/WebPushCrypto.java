package com.aurora.chat.push;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Instant;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Web Push message encryption (RFC 8291, "aes128gcm" content coding from RFC 8188) and VAPID
 * authentication (RFC 8292), using only the JDK.
 */
public final class WebPushCrypto {

    /** Push services must accept at least 4096 bytes of body; header (86) + delimiter (1) + tag (16) leave this much text. */
    public static final int MAX_PLAINTEXT = 4096 - 86 - 17;
    private static final int RECORD_SIZE = 4096;
    private static final SecureRandom RANDOM = new SecureRandom();

    private WebPushCrypto() {
    }

    public static byte[] encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret) {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        return encrypt(plaintext, uaPublic, authSecret, EcKeys.generate(), salt);
    }

    /** Deterministic variant (fixed ephemeral key + salt) for test vectors. */
    static byte[] encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret, KeyPair asKeys, byte[] salt) {
        if (plaintext.length > MAX_PLAINTEXT) {
            throw new IllegalArgumentException("Push payload too large: " + plaintext.length + " bytes");
        }
        if (authSecret.length != 16 || salt.length != 16) {
            throw new IllegalArgumentException("auth secret and salt must be 16 bytes");
        }
        try {
            ECPublicKey uaKey = EcKeys.decodePublic(uaPublic);
            byte[] asPublic = EcKeys.encodePublic((ECPublicKey) asKeys.getPublic());

            KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
            agreement.init(asKeys.getPrivate());
            agreement.doPhase(uaKey, true);
            byte[] ecdhSecret = agreement.generateSecret();

            // RFC 8291 §3.4: IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
            byte[] keyInfo = concat("WebPush: info".getBytes(StandardCharsets.US_ASCII), new byte[] {0}, uaPublic, asPublic);
            byte[] ikm = hmac(hmac(authSecret, ecdhSecret), concat(keyInfo, new byte[] {1}));

            // RFC 8188 §2.2/2.3: content-encryption key and nonce
            byte[] prk = hmac(salt, ikm);
            byte[] cek = Arrays.copyOf(hmac(prk, concat("Content-Encoding: aes128gcm".getBytes(StandardCharsets.US_ASCII),
                    new byte[] {0, 1})), 16);
            byte[] nonce = Arrays.copyOf(hmac(prk, concat("Content-Encoding: nonce".getBytes(StandardCharsets.US_ASCII),
                    new byte[] {0, 1})), 12);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
            byte[] ciphertext = cipher.doFinal(concat(plaintext, new byte[] {2})); // 0x02 = last (and only) record

            ByteBuffer header = ByteBuffer.allocate(16 + 4 + 1 + asPublic.length);
            header.put(salt).putInt(RECORD_SIZE).put((byte) asPublic.length).put(asPublic);
            return concat(header.array(), ciphertext);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Web Push encryption failed", e);
        }
    }

    /** VAPID JWT (ES256) for the push service origin, valid for 12 hours (RFC 8292 allows up to 24). */
    public static String vapidJwt(String audience, String subject, ECPrivateKey privateKey, Instant now) {
        String header = EcKeys.b64url("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        String claims = EcKeys.b64url(("{\"aud\":\"" + jsonEscape(audience) + "\",\"exp\":" + (now.getEpochSecond() + 12 * 3600)
                + ",\"sub\":\"" + jsonEscape(subject) + "\"}").getBytes(StandardCharsets.UTF_8));
        String signingInput = header + "." + claims;
        try {
            java.security.Signature signature = java.security.Signature.getInstance("SHA256withECDSAinP1363Format");
            signature.initSign(privateKey);
            signature.update(signingInput.getBytes(StandardCharsets.US_ASCII));
            return signingInput + "." + EcKeys.b64url(signature.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("VAPID signing failed", e);
        }
    }

    static byte[] hmac(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] part : parts) {
            out.writeBytes(part);
        }
        return out.toByteArray();
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
