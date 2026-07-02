import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const PROD_BANNER_ID = 'ca-app-pub-5628228356531648/6153337198';
const AD_UNIT_ID = __DEV__ ? TestIds.BANNER : PROD_BANNER_ID;

export function BannerAdBox() {
  return (
    <View style={styles.container}>
      <BannerAd unitId={AD_UNIT_ID} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
});
