import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { RouteSearchScreen } from '../screens/RouteSearchScreen';
import { RouteResultScreen } from '../screens/RouteResultScreen';
import { LineDetailScreen } from '../screens/LineDetailScreen';
import { StopDetailScreen } from '../screens/StopDetailScreen';
import { RouteMapScreen } from '../screens/RouteMapScreen';
import { JourneyNavigationScreen } from '../screens/JourneyNavigationScreen';
import { NearbyStopsScreen } from '../screens/NearbyStopsScreen';
import { JourneyHistoryScreen } from '../screens/JourneyHistoryScreen';
import { AdminPanelScreen } from '../screens/AdminPanelScreen';
import { BusCardScreen } from '../screens/BusCardScreen';
import { TabNavigator } from './TabNavigator';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const user = useAppStore((s) => s.user);
  const [onboardingDone, setOnboardingDone] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    AsyncStorage.getItem('onboarding_done').then(val => setOnboardingDone(!!val));
  }, []);

  if (onboardingDone === null) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={user === null && !onboardingDone ? 'Onboarding' : user === null ? 'Login' : 'Main'}
      >
        {user === null ? (
          <>
            {!onboardingDone && <Stack.Screen name="Onboarding" component={OnboardingScreen} />}
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ animation: 'slide_from_right' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen
              name="RouteSearch"
              component={RouteSearchScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="RouteResults"
              component={RouteResultScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="LineDetail"
              component={LineDetailScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="StopDetail"
              component={StopDetailScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="RouteMap"
              component={RouteMapScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="JourneyNavigation"
              component={JourneyNavigationScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="NearbyStops"
              component={NearbyStopsScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="JourneyHistory"
              component={JourneyHistoryScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="AdminPanel"
              component={AdminPanelScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="BusCard"
              component={BusCardScreen}
              options={{ animation: 'slide_from_right' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
