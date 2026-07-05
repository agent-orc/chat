/**
 * Specs for <cac-permission-select>: chip label/tone, selection commit,
 * and disabled behaviour.
 */
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatPermissionOption } from '@coding-agent/chat/core';
import { PermissionSelectComponent } from './permission-select.component';

const OPTIONS: ChatPermissionOption[] = [
  { id: 'yolo', label: 'Bypass permissions', tone: 'warn', description: 'Skip every prompt.' },
  { id: 'workspace-write', label: 'Workspace write', description: 'Auto-approve edits inside the workspace.' },
  { id: 'read-only', label: 'Read-only', description: 'Inspect without mutating.' },
];

async function createSelect(
  inputs: Record<string, unknown> = {}
): Promise<ComponentFixture<PermissionSelectComponent>> {
  const fixture = TestBed.createComponent(PermissionSelectComponent);
  fixture.componentRef.setInput('options', OPTIONS);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('PermissionSelectComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PermissionSelectComponent] });
  });

  it('shows the current option label and warn tone on the chip', async () => {
    const fixture = await createSelect({ value: 'yolo' });
    const chip = fixture.nativeElement.querySelector('[data-testid="cac-permission-select-trigger"]');
    expect(chip.textContent).toContain('Bypass permissions');
    expect(chip.classList.contains('permission-select--warn')).toBe(true);
  });

  it('falls back to a generic chip label without a value', async () => {
    const fixture = await createSelect();
    expect(fixture.componentInstance.chipLabel()).toBe('Permissions');
    expect(fixture.componentInstance.warnTone()).toBe(false);
  });

  it('emits the picked option id and closes', async () => {
    const fixture = await createSelect({ value: 'yolo' });
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    fixture.componentInstance.openPicker(new MouseEvent('click'));
    fixture.componentInstance.onOptionClick('read-only');
    expect(changed).toHaveBeenCalledWith('read-only');
    expect(fixture.componentInstance.pickerOpen()).toBe(false);
  });

  it('does not re-emit when the current option is picked again', async () => {
    const fixture = await createSelect({ value: 'yolo' });
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    fixture.componentInstance.openPicker(new MouseEvent('click'));
    fixture.componentInstance.onOptionClick('yolo');
    expect(changed).not.toHaveBeenCalled();
    expect(fixture.componentInstance.pickerOpen()).toBe(false);
  });

  it('does not open when disabled', async () => {
    const fixture = await createSelect({ disabled: true });
    fixture.componentInstance.openPicker(new MouseEvent('click'));
    expect(fixture.componentInstance.pickerOpen()).toBe(false);
  });
});
