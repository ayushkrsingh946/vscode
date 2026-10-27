/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { DesktopLayoutContext } from '../../../../common/contextkeys.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../../../common/sessionConfig.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionLayoutMode } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID, ChatWindowContext, ChatWindowHasEditorAreaContext, ChatWindowHasSessionActivityBarContext, IChatWindow, IChatWindowKind, IChatWindowService, isChatWindowHandle, SessionLayoutModeContext, SessionSplitLayout } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { chatWindowLayoutModeChoices, TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID, TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID } from '../../browser/chatWindowLayoutActions.js';
import { ChatWindowDefaults, ChatWindowState } from '../../browser/chatWindowState.js';

suite('Chat window layout actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const kind: IChatWindowKind = { id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.SideBySide };

	function createWindow(windowId: number): { window: IChatWindow; state: ChatWindowState } {
		const state = new ChatWindowState(kind, true, new ChatWindowDefaults(kind, disposables.add(new InMemoryStorageService())));
		const window = new class extends mock<IChatWindow>() {
			override readonly windowId = windowId;
			override readonly handle = { chatWindowId: windowId };
			override readonly layout = state.layout;
			override readonly splitLayout = state.splitLayout;
			override readonly layouts = state.layouts;
			override readonly inputOnly = state.inputOnly;
			override setLayout(layout: SessionLayoutMode) { state.setLayout(layout); }
			override setSplitLayout(splitLayout: SessionSplitLayout) { state.setSplitLayout(splitLayout); }
			override toggleConversation() {
				if (state.layout.get() === SessionLayoutMode.Stacked) {
					state.setInputOnly(!state.inputOnly.get());
				}
			}
		}();
		return { window, state };
	}

	function createEnvironment() {
		const a = createWindow(1);
		const b = createWindow(2);
		const activeWindowId = { value: 1 };
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override resolveWindow(context: unknown): IChatWindow | undefined {
				const windowId = isChatWindowHandle(context) ? context.chatWindowId : activeWindowId.value;
				return [a.window, b.window].find(window => window.windowId === windowId);
			}
		}());
		const run = (id: string, context?: unknown) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, context));
		return { a, b, run };
	}

	test('an action invoked from a chat window acts on that window, and without one on the window that is active', () => {
		const { a, b, run } = createEnvironment();
		const stacked = chatWindowLayoutModeChoices.find(choice => choice.mode === SessionLayoutMode.Stacked)!.id;
		const editorOnly = chatWindowLayoutModeChoices.find(choice => choice.mode === SessionLayoutMode.EditorOnly)!.id;

		run(stacked, b.window.handle);
		run(editorOnly);
		run(TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID, b.window.handle);
		run(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID, { chatWindowId: 99 });

		assert.deepStrictEqual({ a: [a.state.layout.get(), a.state.inputOnly.get()], b: [b.state.layout.get(), b.state.inputOnly.get()] }, {
			a: [SessionLayoutMode.EditorOnly, true],
			b: [SessionLayoutMode.Stacked, false],
		});
	});

	test('Show Chat and Show Editor hide one of the two, never the last one shown, and showing the other returns to how both last showed', () => {
		const { a, run } = createEnvironment();
		const steps: SessionLayoutMode[] = [];
		const step = (id: string) => {
			run(id, a.window.handle);
			steps.push(a.state.layout.get());
		};
		step(CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID);
		step(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID);
		step(CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID);
		step(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID);
		step(CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID);
		step(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID);
		assert.deepStrictEqual(steps, [
			SessionLayoutMode.ChatOnly,
			SessionLayoutMode.ChatOnly,
			SessionLayoutMode.SideBySide,
			SessionLayoutMode.EditorOnly,
			SessionLayoutMode.EditorOnly,
			SessionLayoutMode.SideBySide,
		]);
	});

	test('Stacked changes the arrangement while both show, and only how both show next while one shows', () => {
		const { a, run } = createEnvironment();
		run(TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, a.window.handle);
		const whileBoth = a.state.layout.get();
		a.state.setLayout(SessionLayoutMode.ChatOnly);
		run(TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, a.window.handle);
		const whileChatOnly = [a.state.layout.get(), a.state.splitLayout.get()];
		run(CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID, a.window.handle);
		assert.deepStrictEqual({ whileBoth, whileChatOnly, shownAgain: a.state.layout.get() }, {
			whileBoth: SessionLayoutMode.Stacked,
			whileChatOnly: [SessionLayoutMode.ChatOnly, SessionLayoutMode.SideBySide],
			shownAgain: SessionLayoutMode.SideBySide,
		});
	});

	test('the Layout menu of a chat window shows in its title bar in every mode, reads its layout, and never shows in the main window', () => {
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		const items = MenuRegistry.getMenuItems(Menus.ChatWindowTitleBarLayout).filter(isISubmenuItem).filter(item => item.submenu === Menus.ChatWindowLayout);
		const shown = () => items.filter(item => contextKeyService.contextMatchesRules(item.when)).map(item => typeof item.title === 'string' ? item.title : item.title.value);
		const mainWindow = shown();
		ChatWindowContext.bindTo(contextKeyService).set('test');
		ChatWindowHasEditorAreaContext.bindTo(contextKeyService).set(true);
		const layoutContext = SessionLayoutModeContext.bindTo(contextKeyService);
		const perMode = chatWindowLayoutModeChoices.map(choice => {
			layoutContext.set(choice.mode);
			return shown();
		});
		const layoutMenu = MenuRegistry.getMenuItems(Menus.ChatWindowLayout).filter(isIMenuItem).map(item => item.command.id);
		assert.deepStrictEqual({ mainWindow, perMode, layoutMenu: layoutMenu.sort() }, {
			mainWindow: [],
			perMode: [['Layout: Chat Only'], ['Layout: Editor Only'], ['Layout: Stacked'], ['Layout: Side by Side']],
			layoutMenu: [...chatWindowLayoutModeChoices.map(choice => choice.id), TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID, CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID, TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID].sort(),
		});
	});

	test('each action of the Layout menu can be shown as a button beside it, in the title bar or, while it shows the layout actions, the Session Activity Bar; none in the main window', () => {
		const configurationService = new TestConfigurationService({ [SESSION_ACTIVITY_BAR_SETTING]: true, [SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: false });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const contextKeyService = disposables.add(new ContextKeyService(configurationService));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		DesktopLayoutContext.bindTo(contextKeyService).set(true);
		const items = (menu: MenuId) => MenuRegistry.getMenuItems(menu).filter(item => contextKeyService.contextMatchesRules(item.when));
		const describe = (menu: MenuId) => {
			const shown = items(menu);
			return {
				layoutMenu: shown.filter(isISubmenuItem).filter(item => item.submenu === Menus.ChatWindowLayout).length,
				buttons: shown.filter(isIMenuItem).filter(item => item.isHiddenByDefault).map(item => item.command.id).sort(),
				shownButtons: shown.filter(isIMenuItem).filter(item => layoutMenuIds.includes(item.command.id) && !item.isHiddenByDefault).length,
			};
		};
		const layoutMenuIds = MenuRegistry.getMenuItems(Menus.ChatWindowLayout).filter(isIMenuItem).map(item => item.command.id);
		const none = () => ({ layoutMenu: 0, buttons: [], shownButtons: 0 });
		const all = () => ({ layoutMenu: 1, buttons: [...layoutMenuIds].sort(), shownButtons: 0 });

		const mainWindow = { titleBar: describe(Menus.ChatWindowTitleBarLayout), strip: describe(Menus.SessionActivityBar) };
		ChatWindowContext.bindTo(contextKeyService).set('test');
		ChatWindowHasEditorAreaContext.bindTo(contextKeyService).set(true);
		ChatWindowHasSessionActivityBarContext.bindTo(contextKeyService).set(true);
		SessionLayoutModeContext.bindTo(contextKeyService).set(SessionLayoutMode.SideBySide);
		const titleBarVariant = { titleBar: describe(Menus.ChatWindowTitleBarLayout), strip: describe(Menus.SessionActivityBar) };
		configurationService.setUserConfiguration(SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, true);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]), affectsConfiguration: (key: string) => key === SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING }));
		const stripVariant = { titleBar: describe(Menus.ChatWindowTitleBarLayout), strip: describe(Menus.SessionActivityBar) };

		assert.deepStrictEqual({ mainWindow, titleBarVariant, stripVariant }, {
			mainWindow: { titleBar: none(), strip: none() },
			titleBarVariant: { titleBar: all(), strip: none() },
			stripVariant: { titleBar: none(), strip: all() },
		});
	});
});
