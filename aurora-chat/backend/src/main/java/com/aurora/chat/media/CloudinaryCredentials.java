package com.aurora.chat.media;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/** Parsed {@code CLOUDINARY_URL} ({@code cloudinary://API_KEY:API_SECRET@CLOUD_NAME}), as shown on the Cloudinary dashboard. */
public record CloudinaryCredentials(String cloudName, String apiKey, String apiSecret) {

    public static CloudinaryCredentials parse(String url) {
        String value = url == null ? "" : url.trim();
        if (value.startsWith("CLOUDINARY_URL=")) {
            value = value.substring("CLOUDINARY_URL=".length());
        }
        if (!value.startsWith("cloudinary://")) {
            throw new IllegalArgumentException("CLOUDINARY_URL must look like cloudinary://API_KEY:API_SECRET@CLOUD_NAME");
        }
        URI uri = URI.create(value);
        String userInfo = uri.getRawUserInfo();
        String cloud = uri.getHost();
        if (userInfo == null || !userInfo.contains(":") || cloud == null || cloud.isBlank()) {
            throw new IllegalArgumentException("CLOUDINARY_URL must look like cloudinary://API_KEY:API_SECRET@CLOUD_NAME");
        }
        int colon = userInfo.indexOf(':');
        return new CloudinaryCredentials(cloud,
                URLDecoder.decode(userInfo.substring(0, colon), StandardCharsets.UTF_8),
                URLDecoder.decode(userInfo.substring(colon + 1), StandardCharsets.UTF_8));
    }
}
