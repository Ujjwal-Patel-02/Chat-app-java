package com.aurora.chat.push;

import java.math.BigInteger;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Base64;

/** P-256 key helpers in the raw formats used by Web Push (65-byte uncompressed points, 32-byte scalars). */
public final class EcKeys {

    public static final ECParameterSpec P256 = p256();

    private EcKeys() {
    }

    public static KeyPair generate() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            return generator.generateKeyPair();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public static byte[] encodePublic(ECPublicKey key) {
        byte[] out = new byte[65];
        out[0] = 0x04;
        copyUnsigned(key.getW().getAffineX(), out, 1);
        copyUnsigned(key.getW().getAffineY(), out, 33);
        return out;
    }

    public static byte[] encodePrivate(ECPrivateKey key) {
        byte[] out = new byte[32];
        copyUnsigned(key.getS(), out, 0);
        return out;
    }

    public static ECPublicKey decodePublic(byte[] point) {
        if (point == null || point.length != 65 || point[0] != 0x04) {
            throw new IllegalArgumentException("Expected an uncompressed P-256 public key (65 bytes)");
        }
        byte[] x = new byte[32];
        byte[] y = new byte[32];
        System.arraycopy(point, 1, x, 0, 32);
        System.arraycopy(point, 33, y, 0, 32);
        try {
            return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(
                    new ECPublicKeySpec(new ECPoint(new BigInteger(1, x), new BigInteger(1, y)), P256));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("Invalid P-256 public key", e);
        }
    }

    public static ECPrivateKey decodePrivate(byte[] scalar) {
        if (scalar == null || scalar.length != 32) {
            throw new IllegalArgumentException("Expected a 32-byte P-256 private key");
        }
        try {
            return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(
                    new ECPrivateKeySpec(new BigInteger(1, scalar), P256));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("Invalid P-256 private key", e);
        }
    }

    public static String b64url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** Accepts base64url or standard base64, with or without padding. */
    public static byte[] fromB64(String value) {
        String normalized = value.trim().replace('+', '-').replace('/', '_').replace("=", "");
        return Base64.getUrlDecoder().decode(normalized);
    }

    private static void copyUnsigned(BigInteger value, byte[] out, int offset) {
        byte[] bytes = value.toByteArray();
        int start = bytes.length > 32 ? bytes.length - 32 : 0;
        int length = Math.min(bytes.length, 32);
        System.arraycopy(bytes, start, out, offset + 32 - length, length);
    }

    private static ECParameterSpec p256() {
        try {
            AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
            parameters.init(new ECGenParameterSpec("secp256r1"));
            return parameters.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
