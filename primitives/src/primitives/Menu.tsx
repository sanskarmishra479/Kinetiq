import {useCurrentFrame, useVideoConfig} from 'remotion';
import {openClose} from '../motion';
import {useTheme} from '../theme';

type Point = {x: number; y: number};

// Rounded pill button, e.g. "Aspect ▾". Turns accent-colored when active.
export const Chip: React.FC<{
	x: number;
	y: number;
	width: number;
	icon?: React.ReactNode;
	label: string;
	caret?: boolean;
	active?: boolean;
	pressed?: boolean;
}> = ({x, y, width, icon, label, caret = true, active, pressed}) => {
	const theme = useTheme();
	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width,
				height: 34,
				borderRadius: 10,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 7,
				fontFamily: theme.fontFamily,
				fontSize: 15,
				fontWeight: 500,
				color: active ? '#b3a3ff' : theme.muted,
				background: active ? 'rgba(124,92,255,0.16)' : 'transparent',
				border: `1px solid ${active ? 'rgba(124,92,255,0.55)' : 'transparent'}`,
				transform: `scale(${pressed ? 0.95 : 1})`,
				whiteSpace: 'nowrap',
			}}
		>
			{icon}
			{label}
			{caret && (
				<svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.5}>
					<path d="M2 3.5l3 3 3-3" />
				</svg>
			)}
		</div>
	);
};

export type MenuItem = {label: string; hint?: string; icon?: React.ReactNode};

export const MENU_ROW = 48;
export const MENU_PAD = 8;
// Scene y of a menu row's center, for aiming the cursor at it.
export const menuRowY = (top: number, index: number) => top + MENU_PAD + index * MENU_ROW + MENU_ROW / 2;

// Dropdown menu. Rows highlight on their own when the cursor is over them.
export const Dropdown: React.FC<{
	left: number;
	top: number;
	width: number;
	items: MenuItem[];
	openAt: number;
	closeAt?: number;
	cursor?: Point;
	selected?: number;
}> = ({left, top, width, items, openAt, closeAt, cursor, selected}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const theme = useTheme();
	const p = openClose(frame, fps, openAt, closeAt);
	if (p <= 0.001) return null;

	return (
		<div
			style={{
				position: 'absolute',
				left,
				top,
				width,
				padding: MENU_PAD,
				borderRadius: 14,
				background: '#1b1b21',
				border: `1px solid ${theme.border}`,
				boxShadow: '0 24px 50px rgba(0,0,0,0.5)',
				fontFamily: theme.fontFamily,
				opacity: p,
				transform: `translateY(${(1 - p) * -8}px) scale(${0.96 + p * 0.04})`,
				transformOrigin: 'top left',
			}}
		>
			{items.map((item, i) => {
				const rowTop = top + MENU_PAD + i * MENU_ROW;
				const hovered =
					cursor !== undefined &&
					cursor.x > left &&
					cursor.x < left + width &&
					cursor.y > rowTop &&
					cursor.y < rowTop + MENU_ROW;
				return (
					<div
						key={item.label}
						style={{
							height: MENU_ROW,
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							padding: '0 14px',
							borderRadius: 9,
							background: hovered ? 'rgba(255,255,255,0.07)' : 'transparent',
							color: theme.fg,
							fontSize: 18,
						}}
					>
						<span style={{color: theme.muted, display: 'flex'}}>{item.icon}</span>
						<span style={{flex: 1}}>{item.label}</span>
						{item.hint && <span style={{color: theme.muted, fontSize: 15}}>{item.hint}</span>}
						{selected === i && (
							<svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="#b3a3ff" strokeWidth={2}>
								<path d="M3 8.5l3.2 3L13 4.5" />
							</svg>
						)}
					</div>
				);
			})}
		</div>
	);
};
