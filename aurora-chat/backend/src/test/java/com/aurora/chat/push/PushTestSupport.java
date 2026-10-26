package com.aurora.chat.push;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.interfaces.ECPublicKey;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** What a browser does with a push message: RFC 8291 decryption with its own private key. */
public final class PushTestSupport {

    private PushTestSupport() {
    }

    public static byte[] decrypt(byte[] body, KeyPair ua, byte[] authSecret) throws Exception {
        ByteBuffer buffer = ByteBuffer.wrap(body);
        byte[] salt = new byte[16];
        buffer.get(salt);
        int recordSize = buffer.getInt();
        int idLength = buffer.get() & 0xFF;
        byte[] asPublic = new byte[idLength];
        buffer.get(asPublic);
        byte[] ciphertext = new byte[buffer.remaining()];
        buffer.get(ciphertext);
        if (recordSize < ciphertext.length) {
            throw new IllegalStateException("record larger than rs");
        }
        byte[] uaPublic = EcKeys.encodePublic((ECPublicKey) ua.getPublic());

        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(ua.getPrivate());
        agreement.doPhase(EcKeys.decodePublic(asPublic), true);
        byte[] ecdh = agreement.generateSecret();
        byte[] info = WebPushCrypto.concat("WebPush: info".getBytes(StandardCharsets.US_ASCII), new byte[] {0}, uaPublic, asPublic);
        byte[] ikm = WebPushCrypto.hmac(WebPushCrypto.hmac(authSecret, ecdh), WebPushCrypto.concat(info, new byte[] {1}));
        byte[] prk = WebPushCrypto.hmac(salt, ikm);
        byte[] cek = Arrays.copyOf(WebPushCrypto.hmac(prk, WebPushCrypto.concat("Content-Encoding: aes128gcm".getBytes(StandardCharsets.US_ASCII), new byte[] {0, 1})), 16);
        byte[] nonce = Arrays.copyOf(WebPushCrypto.hmac(prk, WebPushCrypto.concat("Content-Encoding: nonce".getBytes(StandardCharsets.US_ASCII), new byte[] {0, 1})), 12);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] padded = cipher.doFinal(ciphertext);
        int end = padded.length - 1;
        while (end >= 0 && padded[end] == 0) {
            end--;
        }
        if (end < 0 || padded[end] != 2) {
            throw new IllegalStateException("missing last-record delimiter");
        }
        return Arrays.copyOf(padded, end);
    }
}
