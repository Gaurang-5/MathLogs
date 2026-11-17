import React from 'react';
import { StyleSheet, Text, useColorScheme } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { offlineQuery } from '../../services/offlineSync';
import { CurrentDueFeesDashboard } from '../../components/fees/CurrentDueFeesDashboard';
import { MonthCoverageFeesDashboard } from '../../components/fees/MonthCoverageFeesDashboard';
import { Feedback, PressableScale, TeacherPage } from '../../components/ui';
import { BorderRadius, Colors, Spacing, TypeScale } from '../../constants/theme';

type FeeMode = 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';

export default function FeesDashboardScreen() {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const modeQuery = useQuery<FeeMode>({
    queryKey: ['dashboard-summary', 'fee-mode'],
    queryFn: () => offlineQuery('fee-mode', async () => (
      await api.get('/dashboard/summary')
    ).data.feeMode),
  });

  if (modeQuery.isLoading) {
    return (
      <TeacherPage title="Fees" scroll={false}>
        <Feedback kind="loading" title="Loading fee workspace" description="Checking the institute’s active fee system." />
      </TeacherPage>
    );
  }

  if (modeQuery.isError || !modeQuery.data) {
    return (
      <TeacherPage title="Fees" scroll={false}>
        <Feedback
          kind="error"
          title="Fee workspace unavailable"
          description="Check the connection and try again."
          action={(
            <PressableScale
              accessibilityLabel="Retry loading fee workspace"
              onPress={() => void modeQuery.refetch()}
              style={[styles.retryButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.retryText, { color: colors.text }]}>Try again</Text>
            </PressableScale>
          )}
        />
      </TeacherPage>
    );
  }

  return modeQuery.data === 'MONTH_COVERAGE'
    ? <MonthCoverageFeesDashboard />
    : <CurrentDueFeesDashboard />;
}

const styles = StyleSheet.create({
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  retryText: TypeScale.label,
});
