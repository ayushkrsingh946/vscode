/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IsAuxiliaryWindowContext } from '../../../common/contextkeys.js';
import { ICreateEditorPartOptions, IEmbeddedEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IEditorGroupViewOptions, IEditorPartsView } from './editor.js';
import { IEditorPartUIState } from './editorPart.js';
import { OwnedEditorPart } from './ownedEditorPart.js';

export interface ICreateEmbeddedEditorPartResult {
	readonly part: EmbeddedEditorPart;
	readonly instantiationService: IInstantiationService;
	readonly disposables: DisposableStore;
}

/**
 * Creates {@link EmbeddedEditorPart}s that render into a container
 * provided by their owner.
 */
export class EmbeddedEditorPartFactory {

	constructor(
		private readonly editorPartsView: IEditorPartsView,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService
	) { }

	create(options: ICreateEditorPartOptions): ICreateEmbeddedEditorPartResult {
		const disposables = new DisposableStore();
		const container = options.container as HTMLElement;

		const partInstantiationService = options.services ? disposables.add(this.instantiationService.createChild(options.services)) : this.instantiationService;
		const part = disposables.add(partInstantiationService.createInstance(EmbeddedEditorPart, getWindow(container).vscodeWindowId, this.editorPartsView, options));
		disposables.add(this.editorPartsView.registerPart(part));
		part.create(container);

		const instantiationService = disposables.add(part.scopedInstantiationService.createChild(new ServiceCollection(
			[IEditorService, this.editorService.createScoped(part, disposables)]
		)));

		// The owner closes the part; the part then releases everything registered for it
		disposables.add(Event.once(part.onWillClose)(() => disposables.dispose()));

		return { part, instantiationService, disposables };
	}
}

export class EmbeddedEditorPart extends OwnedEditorPart implements IEmbeddedEditorPart {

	private static COUNTER = 1;

	constructor(
		windowId: number,
		editorPartsView: IEditorPartsView,
		private readonly createOptions: ICreateEditorPartOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		const id = EmbeddedEditorPart.COUNTER++;
		super(editorPartsView, `workbench.parts.embeddedEditor.${id}`, createOptions.label ?? localize('embeddedEditorPart', "Editor"), windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
	}

	get isPrimary(): boolean {
		return !!this.createOptions.primary;
	}

	override get isTransient(): boolean {
		return true;
	}

	override create(parent: HTMLElement, options?: object): void {
		super.create(parent, options);

		parent.setAttribute('role', 'region');
		parent.setAttribute('aria-label', this.createOptions.label ?? localize('embeddedEditorPart', "Editor"));
	}

	protected override handleContextKeys(): void {
		if (this.windowId !== mainWindow.vscodeWindowId) {
			IsAuxiliaryWindowContext.bindTo(this.scopedContextKeyService).set(true);
		}

		super.handleContextKeys();
	}

	protected override getGroupViewOptions(): IEditorGroupViewOptions | undefined {
		return this.createOptions.groupViewOptions as IEditorGroupViewOptions | undefined;
	}

	protected override loadState(): IEditorPartUIState | undefined {
		return this.createOptions.state as IEditorPartUIState | undefined;
	}
}
