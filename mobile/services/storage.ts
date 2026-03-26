import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage is not available', e);
    }
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage is not available', e);
      return null;
    }
  } else {
    return await SecureStore.getItemAsync(key);
  }
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage is not available', e);
    }
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}
