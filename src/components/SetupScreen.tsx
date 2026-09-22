import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Eyebrow, H, Note, Tiny, Title } from './ui';

/** Shown instead of a red screen when .env has no Firebase values yet. */
export function SetupScreen() {
  const insets = useSafeAreaInsets();
  const steps = [
    ['Create a Firebase project', 'console.firebase.google.com → Add project. Turn on Firestore (production mode) and Authentication → Anonymous and Email/Password.'],
    ['Add a Web app', 'Project settings → Your apps → Web. Copy the config values.'],
    ['Fill in .env', 'Copy .env.example to .env and paste the six EXPO_PUBLIC_FIREBASE_* values.'],
    ['Restart', 'npm run start:clear — env values are read at bundle time.'],
  ];
  return (
    <ScrollView
      className="flex-1 bg-ground dark:bg-ground-dark"
      contentContainerStyle={{ padding: 20, gap: 14, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }}>
      <Eyebrow>One-time setup</Eyebrow>
      <Title>Connect Firebase to run the app</Title>
      <Text className="font-jk text-[14px] leading-5 text-ink2 dark:text-ink2-dark">
        This build talks to a real backend. It needs your Firebase project details before it can sign anyone in.
      </Text>
      {steps.map(([t, s], i) => (
        <Card key={t}>
          <View className="flex-row items-start gap-3">
            <View className="h-7 w-7 items-center justify-center rounded-full bg-brand">
              <Text className="font-jkx text-[12px] text-onbrand">{i + 1}</Text>
            </View>
            <View className="flex-1">
              <H>{t}</H>
              <Tiny>{s}</Tiny>
            </View>
          </View>
        </Card>
      ))}
      <Note>Payments and dispatch also need the Cloud Functions deployed — see README → Backend setup.</Note>
    </ScrollView>
  );
}
