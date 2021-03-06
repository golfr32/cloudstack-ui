import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material';
import * as moment from 'moment';
import { DiskOffering } from '../../../models';
import { Utils } from '../../../services/utils/utils.service';
import { isCustomized } from '../../../models/offering.model';

@Component({
  selector: 'cs-disk-offering-dialog',
  templateUrl: 'disk-offering-dialog.component.html',
  styleUrls: ['disk-offering-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiskOfferingDialogComponent {
  public diskOfferings: DiskOffering[];
  public selectedDiskOffering: DiskOffering;
  public storageAvailable: number | null;
  public resourcesLimitExceeded = false;
  public minSize: number = null;

  constructor(
    @Inject(MAT_DIALOG_DATA) data,
    public dialogRef: MatDialogRef<DiskOfferingDialogComponent>,
  ) {
    this.diskOfferings = data.diskOfferings;
    this.selectedDiskOffering = data.diskOffering || this.diskOfferings[0];
    this.storageAvailable = data.storageAvailable;
    this.minSize = data.customDiskOfferingMinSize;
    this.checkResourcesLimit();
  }

  public offeringCreated(date: string): Date {
    return moment(date).toDate();
  }

  public selectOffering(offering: DiskOffering) {
    this.selectedDiskOffering = offering;
    this.checkResourcesLimit();
  }

  public preventTriggerExpansionPanel(e: Event) {
    e.stopPropagation(); // Don't open/close expansion panel when click on radio button
  }

  public onSubmit(): void {
    this.dialogRef.close(this.selectedDiskOffering);
  }

  public isSubmitButtonDisabled() {
    const isDiskOfferingNotSelected = !this.selectedDiskOffering;
    const isNoDiskOfferings = !this.diskOfferings.length;
    return this.resourcesLimitExceeded || isDiskOfferingNotSelected || isNoDiskOfferings;
  }

  private getDiskSize() {
    if (this.selectedDiskOffering) {
      if (isCustomized(this.selectedDiskOffering)) {
        return this.minSize;
      }

      return this.selectedDiskOffering.disksize;
    }
  }

  private getResourceLimitExceeded(): boolean {
    const diskSize = this.getDiskSize();
    if (this.storageAvailable != null && diskSize != null) {
      return Number(this.storageAvailable) < Number(diskSize);
    }

    return false;
  }

  private checkResourcesLimit() {
    this.resourcesLimitExceeded = this.getResourceLimitExceeded();
  }
}
