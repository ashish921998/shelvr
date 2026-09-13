import { t, useAppLocale } from "@/lib/i18n";
import type { DetailItem } from "@/components/item-detail";
import { AppSymbolIcon } from "@/components/symbol";
import { useFindLinks } from "@/lib/use-find-links";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Phase-3 "Find links": a user-triggered SerpAPI shopping search, launched
// from the toolbar's action menu (an idle item renders no inline chip — it
// made every sparse detail page noisier). Post-search states still render
// inline: results as product cards, a spinner while searching, and a retry
// chip when the search failed.
export function ProductsSection({ item }: { item: DetailItem }) {
  useAppLocale();
  const { theme } = useUnistyles();
  const { findLinks, finding, disabled } = useFindLinks(item);
  const products = item.products;
  const searching = item.productsStatus === "searching";

  if (item.productsStatus === "unavailable") {
    return (
      <View style={styles.findLinksRow}>
        <Text style={styles.chipLabel}>{t("errors.productPhoto")}</Text>
      </View>
    );
  }

  if (searching) {
    return (
      <View style={styles.findLinksRow}>
        <View style={styles.chip}>
          <ActivityIndicator size="small" color={theme.colors.primaryText} />
          <Text style={styles.chipLabel}>{t("products.finding")}</Text>
        </View>
      </View>
    );
  }

  if (products && products.length > 0) {
    return (
      <View style={styles.productsSection}>
        <Text style={styles.productsTitle}>{t("products.shop")}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productsRow}
        >
          {products.map((product, index) => (
            <Pressable
              key={`${product.url}-${index}`}
              style={({ pressed }) => [
                styles.productCard,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => WebBrowser.openBrowserAsync(product.url)}
            >
              {product.thumbnailUrl ? (
                <Image
                  source={{ uri: product.thumbnailUrl }}
                  contentFit="cover"
                  style={styles.productImage}
                />
              ) : (
                <View style={[styles.productImage, styles.productImageEmpty]}>
                  <AppSymbolIcon
                    name="bag"
                    size={22}
                    tintColor={theme.colors.faint}
                  />
                </View>
              )}
              <Text style={styles.productName} numberOfLines={2}>
                {product.title}
              </Text>
              <View style={styles.productMetaRow}>
                {product.price ? (
                  <Text style={styles.productPrice}>{product.price}</Text>
                ) : null}
                {product.merchant ? (
                  <Text style={styles.productMerchant} numberOfLines={1}>
                    {product.merchant}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  // Idle (never searched): nothing inline — the trigger lives in the action
  // menu. Only a failed search (retry affordance) or a completed empty search
  // ("No matches") needs a chip here.
  if (item.productsStatus === undefined) {
    return null;
  }

  return (
    <View style={styles.findLinksRow}>
      <Pressable
        style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
        onPress={findLinks}
        disabled={disabled}
        hitSlop={6}
      >
        {finding ? (
          <ActivityIndicator size="small" color={theme.colors.primaryText} />
        ) : (
          <AppSymbolIcon
            name="bag"
            size={14}
            tintColor={theme.colors.primaryText}
          />
        )}
        <Text style={styles.chipLabel}>
          {item.productsStatus === "failed"
            ? t("products.retry")
            : t("products.noMatches")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  findLinksRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  // Shared pill for the detail screen's small actions (retry a failed save,
  // find shopping links).
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.primarySoft,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 50,
  },
  chipLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  productsSection: {
    gap: theme.gap(1),
  },
  productsTitle: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.colors.foreground,
  },
  productsRow: {
    gap: theme.gap(1.25),
  },
  productCard: {
    width: 150,
    gap: theme.gap(0.75),
  },
  productImage: {
    width: 150,
    height: 130,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  productImageEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  productName: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: theme.colors.foreground,
  },
  productMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
  },
  productPrice: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    color: theme.colors.foreground,
  },
  productMerchant: {
    flexShrink: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    color: theme.colors.muted,
  },
}));
