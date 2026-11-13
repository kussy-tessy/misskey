<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<time :title="absolute" :class="{ [$style.old1]: colored && (ago > 60 * 60 * 24 * 90), [$style.old2]: colored && (ago > 60 * 60 * 24 * 180) }">
	<template v-if="invalid">{{ i18n.ts._ago.invalid }}</template>
	<template v-else-if="mode === 'relative'">{{ relativeMix }}</template>
	<template v-else-if="mode === 'absolute'">{{ absolute }}</template>
	<template v-else-if="mode === 'detail'">{{ absolute }} ({{ relative }})</template>
</time>
</template>

<script lang="ts" setup>
import isChromatic from 'chromatic/isChromatic';
import { computed } from 'vue';
import { i18n } from '@/i18n.js';
import { dateTimeFormat } from '@@/js/intl-const.js';
import { parseTime, formatRelativeTime } from '@@/js/relative-time.js';
import { useLowresTime } from '@@/js/use-lowres-time.js';

const props = withDefaults(defineProps<{
	time: Date | string | number | null;
	origin?: Date | null;
	mode?: 'relative' | 'absolute' | 'detail';
	colored?: boolean;
}>(), {
	origin: isChromatic() ? () => new Date('2023-04-01T00:00:00Z') : null,
	mode: 'relative',
});

// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const _time = parseTime(props.time);
const invalid = Number.isNaN(_time);
const absolute = !invalid ? dateTimeFormat.format(_time) : i18n.ts._ago.invalid;
const dateTime = new Date(_time);
const padZero = val => ('0' + val).slice(-2);
const absoluteTimeOnly = !invalid ? 
	`${padZero(dateTime.getHours())}:${padZero(dateTime.getMinutes())}` : i18n.ts._ago.invalid;

// 10秒ごとの再計算のたびに作り直さないよう、インスタンスごとに一度だけ作る
const relativeTimeLocale = {
	ago: i18n.tsx._ago,
	timeIn: i18n.tsx._timeIn,
	justNow: i18n.ts._ago.justNow,
};

const actualNow = useLowresTime();
const now = computed(() => (props.origin ? props.origin.getTime() : actualNow.value));

// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const ago = computed(() => (now.value - _time) / 1000/*ms*/);

const relative = computed<string>(()=>{
	if (props.mode === 'absolute') return ''; // absoluteではrelativeを使わないので計算しない
	if (invalid) return i18n.ts._ago.invalid;

	return formatRelativeTime(ago.value, relativeTimeLocale);
});

const relativeMix = computed<string>(() => {
	if (props.mode === 'absolute') return ''; // absoluteではrelativeを使わないので計算しない
	if (invalid) return i18n.ts._ago.invalid;

	const mixTimeFormat = (relative) => `${absoluteTimeOnly}(${relative})`;
	const mixDateTimeFormat = (relative) => `${absolute}(${relative})`;

	return (
		ago.value >= 31536000 ? mixDateTimeFormat(i18n.tsx._ago.yearsAgo({ n: Math.round(ago.value / 31536000).toString() })) :
		ago.value >= 2592000 ? mixDateTimeFormat(i18n.tsx._ago.monthsAgo({ n: Math.round(ago.value / 2592000).toString() })) :
		ago.value >= 604800 ? mixDateTimeFormat(i18n.tsx._ago.weeksAgo({ n: Math.round(ago.value / 604800).toString() })) :
		ago.value >= 86400 ? mixDateTimeFormat(i18n.tsx._ago.daysAgo({ n: Math.round(ago.value / 86400).toString() })) :
		ago.value >= 3600 ? mixTimeFormat(i18n.tsx._ago.hoursAgo({ n: Math.round(ago.value / 3600).toString() })) :
		ago.value >= 60 ? mixTimeFormat(i18n.tsx._ago.minutesAgo({ n: (~~(ago.value / 60)).toString() })) :
		ago.value >= 10 ? mixTimeFormat(i18n.tsx._ago.secondsAgo({ n: (~~(ago.value % 60)).toString() })) :
		ago.value >= -3 ? i18n.ts._ago.justNow :
		ago.value < -31536000 ? i18n.tsx._timeIn.years({ n: Math.round(-ago.value / 31536000).toString() }) :
		ago.value < -2592000 ? i18n.tsx._timeIn.months({ n: Math.round(-ago.value / 2592000).toString() }) :
		ago.value < -604800 ? i18n.tsx._timeIn.weeks({ n: Math.round(-ago.value / 604800).toString() }) :
		ago.value < -86400 ? i18n.tsx._timeIn.days({ n: Math.round(-ago.value / 86400).toString() }) :
		ago.value < -3600 ? i18n.tsx._timeIn.hours({ n: Math.round(-ago.value / 3600).toString() }) :
		ago.value < -60 ? i18n.tsx._timeIn.minutes({ n: (~~(-ago.value / 60)).toString() }) :
		i18n.tsx._timeIn.seconds({ n: (~~(-ago.value % 60)).toString() })
	);
});
</script>

<style lang="scss" module>
.old1 {
	color: var(--MI_THEME-warn);
}

.old1.old2 {
	color: var(--MI_THEME-error);
}
</style>
