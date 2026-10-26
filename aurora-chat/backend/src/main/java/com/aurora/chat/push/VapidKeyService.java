package com.aurora.chat.push;

import java.security.KeyPair;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.aurora.chat.config.AppProperties;

/**
 * The server's VAPID identity. Uses APP_PUSH_VAPID_PUBLIC_KEY / APP_PUSH_VAPID_PRIVATE_KEY when set (same format as
 * {@code npx web-push generate-vapid-keys}); otherwise generates a key pair once and keeps it in the database, so
 * existing browser subscriptions survive restarts.
 */
@Service
public class VapidKeyService {

    private static final Logger log = LoggerFactory.getLogger(VapidKeyService.class);
    private static final String PUBLIC_SETTING = "vapid.public";
    private static final String PRIVATE_SETTING = "vapid.private";

    public record VapidKeys(ECPrivateKey privateKey, byte[] publicKey, String publicKeyBase64) {
    }

    private final AppProperties.Push config;
    private final AppSettingRepository settings;
    private final TransactionTemplate transactions;
    private volatile VapidKeys keys;

    public VapidKeyService(AppProperties properties, AppSettingRepository settings, TransactionTemplate transactions) {
        this.config = properties.push();
        this.settings = settings;
        this.transactions = transactions;
    }

    public VapidKeys keys() {
        VapidKeys current = keys;
        if (current == null) {
            synchronized (this) {
                if (keys == null) {
                    keys = load();
                }
                current = keys;
            }
        }
        return current;
    }

    private VapidKeys load() {
        if (!config.vapidPublicKey().isBlank() && !config.vapidPrivateKey().isBlank()) {
            return fromStrings(config.vapidPublicKey(), config.vapidPrivateKey());
        }
        return transactions.execute(status -> {
            var publicSetting = settings.findById(PUBLIC_SETTING);
            var privateSetting = settings.findById(PRIVATE_SETTING);
            if (publicSetting.isPresent() && privateSetting.isPresent()) {
                return fromStrings(publicSetting.get().getValue(), privateSetting.get().getValue());
            }
            KeyPair pair = EcKeys.generate();
            String publicKey = EcKeys.b64url(EcKeys.encodePublic((ECPublicKey) pair.getPublic()));
            String privateKey = EcKeys.b64url(EcKeys.encodePrivate((ECPrivateKey) pair.getPrivate()));
            settings.save(new AppSetting(PUBLIC_SETTING, publicKey));
            settings.save(new AppSetting(PRIVATE_SETTING, privateKey));
            log.info("Generated a VAPID key pair for Web Push and stored it in the database.");
            return fromStrings(publicKey, privateKey);
        });
    }

    private static VapidKeys fromStrings(String publicKey, String privateKey) {
        byte[] publicBytes = EcKeys.fromB64(publicKey);
        EcKeys.decodePublic(publicBytes); // validates
        return new VapidKeys(EcKeys.decodePrivate(EcKeys.fromB64(privateKey)), publicBytes, EcKeys.b64url(publicBytes));
    }
}
