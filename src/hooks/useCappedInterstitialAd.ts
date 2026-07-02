import { useCallback, useEffect } from 'react';
import { useInterstitialAd, TestIds } from 'react-native-google-mobile-ads';

const PROD_INTERSTITIAL_ID = 'ca-app-pub-5628228356531648/4473424015';
const AD_UNIT_ID = __DEV__ ? TestIds.INTERSTITIAL : PROD_INTERSTITIAL_ID;
const SHOW_EVERY_N = 3;

let triggerCount = 0; // modül seviyesinde — rota arama ve oyun girişi aynı sayacı/kadansı paylaşır

export function useCappedInterstitialAd() {
  const { isLoaded, isClosed, load, show } = useInterstitialAd(AD_UNIT_ID);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isClosed) load(); // sıradaki gösterim için yeniden yükle
  }, [isClosed, load]);

  const maybeShow = useCallback(() => {
    triggerCount += 1;
    if (triggerCount % SHOW_EVERY_N === 0 && isLoaded) {
      show();
    }
  }, [isLoaded, show]);

  return { maybeShow };
}
