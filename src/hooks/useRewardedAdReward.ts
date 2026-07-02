import { useEffect, useRef } from 'react';
import { useRewardedAd, TestIds } from 'react-native-google-mobile-ads';

const PROD_REWARDED_ID = 'ca-app-pub-5628228356531648/9071144575';
const AD_UNIT_ID = __DEV__ ? TestIds.REWARDED : PROD_REWARDED_ID;

export function useRewardedAdReward(onEarned: () => void) {
  const { isLoaded, isEarnedReward, isClosed, load, show } = useRewardedAd(AD_UNIT_ID);
  const onEarnedRef = useRef(onEarned);
  onEarnedRef.current = onEarned;

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isEarnedReward) onEarnedRef.current();
  }, [isEarnedReward]);

  useEffect(() => {
    if (isClosed) load(); // sıradaki gösterim için yeniden yükle
  }, [isClosed, load]);

  return { isLoaded, show };
}
