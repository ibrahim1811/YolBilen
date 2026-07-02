import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';
import { HomeScreen } from '../screens/HomeScreen';
import { LinesScreen } from '../screens/LinesScreen';
import { CommunityScreen } from '../screens/CommunityScreen';
import { GamesScreen } from '../screens/GamesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import type { TabParamList } from '../types';

const Tab = createBottomTabNavigator<TabParamList>();

const tabIcons: Record<string, { active: string; inactive: string }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Lines: { active: 'bus', inactive: 'bus' },
  Community: { active: 'account-group', inactive: 'account-group-outline' },
  Games: { active: 'gamepad-variant', inactive: 'gamepad-variant-outline' },
  Profile: { active: 'account-circle', inactive: 'account-circle-outline' },
};

const tabLabels: Record<string, string> = {
  Home: 'Ana Sayfa',
  Lines: 'Hatlar',
  Community: 'Topluluk',
  Games: 'Oyunlar',
  Profile: 'Profil',
};

export function TabNavigator() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = tabIcons[route.name];
          return (
            <MaterialCommunityIcons
              name={(focused ? icons.active : icons.inactive) as any}
              size={size}
              color={color}
            />
          );
        },
        tabBarLabel: tabLabels[route.name],
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
          borderTopWidth: 1,
          elevation: 0,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Lines" component={LinesScreen} />
      <Tab.Screen name="Community" component={CommunityScreen} />
      <Tab.Screen name="Games" component={GamesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
