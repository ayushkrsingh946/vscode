/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus, SessionActivityBarGroup } from '../../../browser/menus.js';
import { SessionActivityBarLayoutActionsContext } from '../../../common/contextkeys.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionLayoutMode } from '../../../common/sessionGridLayout/sessionGridLayout.js';
import { CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID, ChatWindowContext, ChatWindowHasEditorAreaContext, ChatWindowHasSessionActivityBarContext, IChatWindow, IChatWindowService, SessionLayoutModeContext, SessionSplitLayoutContext } from '../../../services/chatWindow/browser/chatWindowService.js';

/** A layout mode as offered to the user. */
export interface IChatWindowLayoutModeChoice {
	readonly mode: SessionLayoutMode;
	readonly id: string;
	readonly title: ILocalizedString;
	/** Its title in the Layout submenu. */
	readonly shortTitle: string;
	readonly icon: ThemeIcon;
}

/** The layout modes of a chat window, in the order they are offered; the ids are those chat windows always used. */
export const chatWindowLayoutModeChoices: readonly IChatWindowLayoutModeChoice[] = [{
	mode: SessionLayoutMode.ChatOnly,
	id: 'sessions.chatWindow.showChatOnly',
	title: localize2('chatWindowLayoutChatOnly', "Show Chat Only"),
	shortTitle: localize('chatWindowLayoutChatOnly.short', "Chat Only"),
	icon: Codicon.layoutSidebarLeft,
}, {
	mode: SessionLayoutMode.EditorOnly,
	id: 'sessions.chatWindow.showEditorOnly',
	title: localize2('chatWindowLayoutEditorOnly', "Show Editor Only"),
	shortTitle: localize('chatWindowLayoutEditorOnly.short', "Editor Only"),
	icon: Codicon.layoutSidebarRight,
}, {
	mode: SessionLayoutMode.Stacked,
	id: 'sessions.chatWindow.showEditorAboveChat',
	title: localize2('chatWindowLayoutStacked', "Show Chat and Editor Stacked"),
	shortTitle: localize('chatWindowLayoutStacked.short', "Stacked"),
	icon: Codicon.splitVertical,
}, {
	mode: SessionLayoutMode.SideBySide,
	id: 'sessions.chatWindow.showSideBySide',
	title: localize2('chatWindowLayoutSideBySide', "Show Chat and Editor Side by Side"),
	shortTitle: localize('chatWindowLayoutSideBySide.short', "Side by Side"),
	icon: Codicon.splitHorizontal,
}];

export const TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID = 'sessions.chatWindow.toggleChat';
export const TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID = 'sessions.chatWindow.toggleArrangement';
export const TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID = 'sessions.chatWindow.toggleConversation';

/** In a chat window with an editor area, while AI features are enabled: where the layout actions apply. */
const ChatWindowLayoutContext = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(ChatWindowContext.key), ChatWindowHasEditorAreaContext)!;

/** The groups of {@link Menus.ChatWindowLayout}. */
const ChatWindowLayoutMenuGroup = {
	modes: '0_modes',
	panes: '1_panes',
	arrangement: '2_arrangement',
	conversation: '3_conversation',
} as const;

/**
 * The chat window an action acts on: the one it was invoked from, by the handle its toolbar or strip passes, else the one
 * whose window is active, such as for a keybinding or the Command Palette.
 */
function getChatWindow(accessor: ServicesAccessor, context: unknown): IChatWindow | undefined {
	return accessor.get(IChatWindowService).resolveWindow(context);
}

/** Shows `mode` in `window`, and announces the layout to screen readers. */
export function showChatWindowLayout(window: IChatWindow, mode: SessionLayoutMode): void {
	if (!window.layouts.includes(mode) || window.layout.get() === mode) {
		return;
	}
	window.setLayout(mode);
	const choice = chatWindowLayoutModeChoices.find(candidate => candidate.mode === mode);
	if (choice) {
		status(localize('chatWindowLayoutChanged', "Layout: {0}", choice.title.value));
	}
}

for (const choice of chatWindowLayoutModeChoices) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: choice.id,
				title: choice.title,
				category: SessionsCategories.Sessions,
				icon: choice.icon,
				f1: true,
				precondition: ChatWindowLayoutContext,
				toggled: SessionLayoutModeContext.isEqualTo(choice.mode),
				menu: {
					id: Menus.ChatWindowLayout,
					group: ChatWindowLayoutMenuGroup.modes,
					order: chatWindowLayoutModeChoices.indexOf(choice),
					when: ChatWindowLayoutContext,
				},
			});
		}

		override run(accessor: ServicesAccessor, context?: unknown): void {
			const window = getChatWindow(accessor, context);
			if (window) {
				showChatWindowLayout(window, choice.mode);
			}
		}
	});
}

/** Shows or hides the chat or the editor area; the last one that shows cannot be hidden, and showing the other returns to how both last showed. */
function togglePane(window: IChatWindow, pane: 'chat' | 'editor'): void {
	const mode = window.layout.get();
	const hiddenMode = pane === 'chat' ? SessionLayoutMode.EditorOnly : SessionLayoutMode.ChatOnly;
	const aloneMode = pane === 'chat' ? SessionLayoutMode.ChatOnly : SessionLayoutMode.EditorOnly;
	if (mode === hiddenMode) {
		showChatWindowLayout(window, window.splitLayout.get());
	} else if (mode !== aloneMode) {
		showChatWindowLayout(window, hiddenMode);
	}
}

registerAction2(class ToggleChatWindowChatAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID,
			title: localize2('chatWindowShowChat', "Show Chat"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowLayoutContext, SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.ChatOnly)),
			toggled: SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.EditorOnly),
			menu: { id: Menus.ChatWindowLayout, group: ChatWindowLayoutMenuGroup.panes, order: 1, when: ChatWindowLayoutContext },
		});
	}

	override run(accessor: ServicesAccessor, context?: unknown): void {
		const window = getChatWindow(accessor, context);
		if (window) {
			togglePane(window, 'chat');
		}
	}
});

registerAction2(class ToggleChatWindowEditorAction extends Action2 {
	constructor() {
		super({
			id: CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID,
			title: localize2('chatWindowShowEditor', "Show Editor"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowLayoutContext, SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.EditorOnly)),
			toggled: SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.ChatOnly),
			menu: { id: Menus.ChatWindowLayout, group: ChatWindowLayoutMenuGroup.panes, order: 2, when: ChatWindowLayoutContext },
		});
	}

	override run(accessor: ServicesAccessor, context?: unknown): void {
		const window = getChatWindow(accessor, context);
		if (window) {
			togglePane(window, 'editor');
		}
	}
});

registerAction2(class ToggleChatWindowArrangementAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID,
			title: localize2('chatWindowStacked', "Stacked"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ChatWindowLayoutContext,
			toggled: SessionSplitLayoutContext.isEqualTo(SessionLayoutMode.Stacked),
			menu: { id: Menus.ChatWindowLayout, group: ChatWindowLayoutMenuGroup.arrangement, order: 1, when: ChatWindowLayoutContext },
		});
	}

	override run(accessor: ServicesAccessor, context?: unknown): void {
		const window = getChatWindow(accessor, context);
		if (!window) {
			return;
		}
		// While only one of the chat and the editor area shows, this only sets how both show next.
		const next = window.splitLayout.get() === SessionLayoutMode.Stacked ? SessionLayoutMode.SideBySide : SessionLayoutMode.Stacked;
		const mode = window.layout.get();
		if (mode === SessionLayoutMode.Stacked || mode === SessionLayoutMode.SideBySide) {
			showChatWindowLayout(window, next);
		} else {
			window.setSplitLayout(next);
		}
	}
});

registerAction2(class ToggleChatWindowConversationAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID,
			title: localize2('chatWindowToggleConversation', "Toggle Chat Conversation"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowLayoutContext, SessionLayoutModeContext.isEqualTo(SessionLayoutMode.Stacked)),
			menu: { id: Menus.ChatWindowLayout, group: ChatWindowLayoutMenuGroup.conversation, order: 1, when: ContextKeyExpr.and(ChatWindowLayoutContext, SessionLayoutModeContext.isEqualTo(SessionLayoutMode.Stacked)) },
		});
	}

	override run(accessor: ServicesAccessor, context?: unknown): void {
		getChatWindow(accessor, context)?.toggleConversation();
	}
});

// One entry point to the Layout menu of a chat window: in its title bar, or in its Session Activity Bar while the strip shows
// the layout actions, as the main window's does. The Layout menu ends the layout actions, after the buttons the user shows.
const ChatWindowStripLayoutContext = ContextKeyExpr.and(ChatWindowLayoutContext, ChatWindowHasSessionActivityBarContext, SessionActivityBarLayoutActionsContext)!;
const ChatWindowTitleBarLayoutContext = ContextKeyExpr.and(ChatWindowLayoutContext, ContextKeyExpr.or(ChatWindowHasSessionActivityBarContext.negate(), SessionActivityBarLayoutActionsContext.negate()))!;
const CHAT_WINDOW_LAYOUT_MENU_ORDER = 100;
for (const choice of chatWindowLayoutModeChoices) {
	const title = localize('chatWindowLayoutMenu', "Layout: {0}", choice.shortTitle);
	const shown = SessionLayoutModeContext.isEqualTo(choice.mode);
	MenuRegistry.appendMenuItem(Menus.ChatWindowTitleBarLayout, {
		submenu: Menus.ChatWindowLayout,
		title,
		icon: Codicon.layout,
		group: 'navigation',
		order: CHAT_WINDOW_LAYOUT_MENU_ORDER,
		when: ContextKeyExpr.and(ChatWindowTitleBarLayoutContext, shown),
	});
	MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
		submenu: Menus.ChatWindowLayout,
		title,
		icon: Codicon.layout,
		group: SessionActivityBarGroup.Panel,
		order: CHAT_WINDOW_LAYOUT_MENU_ORDER,
		when: ContextKeyExpr.and(ChatWindowStripLayoutContext, shown),
	});
}

/** The button of each action of the Layout menu, which the user can show beside the Layout menu, as an icon of its own. */
const chatWindowLayoutButtons: readonly { readonly id: string; readonly title: ILocalizedString; readonly icon: ThemeIcon; readonly toggled?: ContextKeyExpression }[] = [
	...chatWindowLayoutModeChoices.map(choice => ({ id: choice.id, title: choice.title, icon: choice.icon, toggled: SessionLayoutModeContext.isEqualTo(choice.mode) })),
	{ id: TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID, title: localize2('chatWindowToggleChatButton', "Toggle Chat"), icon: Codicon.commentDiscussion, toggled: SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.EditorOnly) },
	{ id: CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID, title: localize2('chatWindowToggleEditorButton', "Toggle Editor"), icon: Codicon.layoutSidebarRight, toggled: SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.ChatOnly) },
	{ id: TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, title: localize2('chatWindowToggleArrangementButton', "Toggle Stacked"), icon: Codicon.layoutPanel, toggled: SessionSplitLayoutContext.isEqualTo(SessionLayoutMode.Stacked) },
	{ id: TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID, title: localize2('chatWindowToggleConversation', "Toggle Chat Conversation"), icon: Codicon.listFlat },
];
chatWindowLayoutButtons.forEach((button, index) => {
	const command = { id: button.id, title: button.title, icon: button.icon, toggled: button.toggled };
	MenuRegistry.appendMenuItem(Menus.ChatWindowTitleBarLayout, { command, group: 'navigation', order: index, when: ChatWindowTitleBarLayoutContext, isHiddenByDefault: true });
	MenuRegistry.appendMenuItem(Menus.SessionActivityBar, { command, group: SessionActivityBarGroup.Panel, order: CHAT_WINDOW_LAYOUT_MENU_ORDER + 1 + index, when: ChatWindowStripLayoutContext, isHiddenByDefault: true });
});

/** Names this module, which registers chat window actions, in the list of the chat window contribution; see `chatWindowContributions`. */
export const chatWindowLayoutActionsContribution = 'chatWindowLayoutActions';
