import { Component, OnInit } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { MdlDialogService } from 'angular2-mdl';
import { TranslateService } from 'ng2-translate';

import {
  Iso,
  IsoService,
  Template,
  TemplateService,
 } from '../shared';
import { OsFamily } from '../../shared/models/os-type.model';
import { INotificationStatus, JobsNotificationService, NotificationService } from '../../shared/services';
import { TemplateCreationComponent } from '../template-creation/template-creation.component';
import { VmService } from '../../vm/shared/vm.service';
import { AuthService } from '../../shared/services/auth.service';
import { StorageService } from '../../shared/services/storage.service';


@Component({
  selector: 'cs-template-list',
  templateUrl: 'template-list.component.html',
  styleUrls: ['template-list.component.scss']
})
export class TemplateListComponent implements OnInit {
  public isDetailOpen: boolean;
  public selectedTemplate: Template | Iso;

  public showIso: boolean = false;
  public query: string;
  public selectedOsFamilies: Array<OsFamily>;
  public selectedFilters: Array<string>;

  public templateList: Array<Template | Iso>;
  public visibleTemplateList: Array<Template | Iso>;

  public osFamilies: Array<OsFamily> = [
    'Linux',
    'Windows',
    'Mac OS',
    'Other'
  ];

  public filters = [
    'featured',
    'self'
  ];

  public filterTranslations: {};

  private queryStream = new Subject<string>();

  constructor(
    private dialogService: MdlDialogService,
    private isoService: IsoService,
    private jobNotificationService: JobsNotificationService,
    private translateService: TranslateService,
    private templateService: TemplateService,
    private notificationService: NotificationService,
    private vmService: VmService,
    private authService: AuthService,
    private storageService: StorageService
  ) {}

  public ngOnInit(): void {
    this.selectedOsFamilies = this.osFamilies.concat();
    this.selectedFilters = this.filters.concat();

    this.fetchData();
    this.translateService.get(
      this.filters.map(filter => `TEMPLATE_${filter.toUpperCase()}`)
    )
      .subscribe(translations => {
        const strs = {};
        this.filters.forEach(filter => {
          strs[filter] = translations[`TEMPLATE_${filter.toUpperCase()}`];
        });
        this.filterTranslations = strs;
      });

    this.queryStream
      .distinctUntilChanged()
      .subscribe(query => {
        this.filterResults(query);
      });

    this.showIso = this.storageService.read('templateDisplayMode') === 'iso';
    this.switchDisplayMode();
  }

  public hideDetail(): void {
    this.isDetailOpen = !this.isDetailOpen;
    this.selectedTemplate = null;
  }

  public switchDisplayMode(): void {
    this.fetchData();
    this.storageService.write('templateDisplayMode', this.showIso ? 'iso' : 'template');
  }

  public showCreationDialog(): void {
    this.dialogService.showCustomDialog({
      component: TemplateCreationComponent,
      isModal: true,
      styles: { 'width': '720px', 'overflow': 'visible', padding: '11.7px' },
      providers: [{ provide: 'mode', useValue: this.showIso ? 'Iso' : 'Template' }],
      clickOutsideToClose: true,
      enterTransitionDuration: 400,
      leaveTransitionDuration: 400
    })
      .switchMap(res => res.onHide())
      .subscribe(params => {
        if (!params) {
          return;
        }

        this.createTemplate(params);
      });
  }

  public createTemplate(params): void {
    let translatedStrings;
    let notificationId;

    let currentMode = this.showIso ? 'ISO' : 'TEMPLATE';

    this.translateService.get([
      'ISO_REGISTER_IN_PROGRESS',
      'ISO_REGISTER_DONE',
      'ISO_REGISTER_FAILED',
      'TEMPLATE_REGISTER_IN_PROGRESS',
      'TEMPLATE_REGISTER_DONE',
      'TEMPLATE_REGISTER_FAILED'
    ])
      .switchMap<Array<string>, Template | Iso>(strs => {
        translatedStrings = strs;
        notificationId = this.jobNotificationService.add(
          translatedStrings[`${currentMode}_REGISTER_IN_PROGRESS`]
        );
        return this.showIso ? this.addIso(params) : this.addTemplate(params);
      })
      .subscribe((template: Template | Iso) => {
        this.addTemplateToList(template);
        this.jobNotificationService.add({
          id: notificationId,
          message: translatedStrings[`${currentMode}_REGISTER_DONE`],
          status: INotificationStatus.Finished
        });
      }, error => {
        this.notificationService.error(error.json()['registerisoresponse']['errortext']);
        this.jobNotificationService.add({
          id: notificationId,
          message: translatedStrings[`${currentMode}_REGISTER_FAILED`],
          status: INotificationStatus.Failed
        });
      });
  }

  public addIso(isoCreationData: any): Observable<Iso> {
    return this.isoService.register(new Iso(isoCreationData), isoCreationData.url);
  }

  public addTemplate(templateCreationData: any): Observable<Template> {
    return this.templateService.register(templateCreationData, templateCreationData.url);
  }

  public deleteTemplate(template: Template | Iso): void {
    let translatedStrings;
    let notificationId;
    const currentMode = this.showIso ? 'ISO' : 'TEMPLATE';

    this.translateService.get([
      'DELETE_ISO_IN_PROGRESS',
      'DELETE_ISO_DONE',
      'DELETE_ISO_FAILED',
      'DELETE_ISO_CONFIRM',
      'DELETE_TEMPLATE_IN_PROGRESS',
      'DELETE_TEMPLATE_DONE',
      'DELETE_TEMPLATE_FAILED',
      'DELETE_TEMPLATE_CONFIRM'
    ])
      .switchMap((strs) => {
        translatedStrings = strs;
        return this.dialogService.confirm(translatedStrings[`DELETE_${currentMode}_CONFIRM`]);
      })
      .switchMap(() => {
        if (template instanceof Template) {
          notificationId = this.jobNotificationService.add(
            translatedStrings['DELETE_TEMPLATE_IN_PROGRESS']
          );
          return this.templateService.delete(template);
        }
        return this.vmService.getListOfVmsThatUseIso(template)
          .map(vmList => {
            if (vmList.length) {
              return Observable.throw({
                type: 'vmsInUse',
                vms: vmList
              });
            }
            notificationId = this.jobNotificationService.add(
              translatedStrings['DELETE_ISO_IN_PROGRESS']
            );
            return this.isoService.delete(template);
          });
      })
      .subscribe(() => {
        this.removeTemplateFromList(template);
        this.jobNotificationService.add({
          id: notificationId,
          message: translatedStrings[`DELETE_${currentMode}_DONE`],
          status: INotificationStatus.Finished
        });
      }, error => {
        if (!error) {
          return;
        }
        if (error.type === 'vmsInUse') {
          let listOfUsedVms = error.vms.map(vm => vm.name).join(', ');
          this.translateService.get('DELETE_ISO_VMS_IN_USE', {
            vms: listOfUsedVms
          }).subscribe(str => {
            this.dialogService.alert(str);
          });
        } else {
          this.jobNotificationService.add({
            id: notificationId,
            message: translatedStrings[`DELETE_${currentMode}_FAILED`],
            status: INotificationStatus.Failed
          });
        }
      });
  }

  public selectTemplate(template: Template | Iso): void {
    this.selectedTemplate = template;
    this.isDetailOpen = true;
  }

  public search(e: KeyboardEvent): void {
    this.queryStream.next((e.target as HTMLInputElement).value);
  }

  public filterResults(query?: string): void {
    if (!query) {
      query = this.query;
    }
    this.visibleTemplateList = this.filterBySearch(query, this.filterByCategories(this.templateList));
  }

  private addTemplateToList(template: Template | Iso): void {
    // stub, fix asap
    if (template instanceof Template) {
      this.templateService.addOsTypeData(template)
        .subscribe(templateWithOs => {
          this.templateList.push(templateWithOs);
          this.filterResults();
        });
      return;
    }
    this.isoService.addOsTypeData(template)
      .subscribe(isoWithOs => {
        this.templateList.push(isoWithOs);
        this.filterResults();
      });
  }

  private removeTemplateFromList(template: Template | Iso): void {
    this.templateList = this.templateList.filter(listTemplate => template.id !== listTemplate.id);
    this.filterResults();
    if (template.id === this.selectedTemplate.id) {
      this.selectedTemplate = null;
      this.isDetailOpen = false;
    }
  }

  private filterByCategories(templateList: Array<Template | Iso>): Array<Template | Iso> {
    return templateList
      .filter(template => {
        let featuredFilter = this.selectedFilters.includes('featured') || !template.isFeatured;
        let selfFilter = this.selectedFilters.includes('self') || !(template.account === this.authService.username);
        let osFilter = this.selectedOsFamilies.includes(template.osType.osFamily);
        return featuredFilter && selfFilter && osFilter;
      });
  }

  private filterBySearch(query: string, templateList: Array<Template | Iso>): Array<Template | Iso> {
    if (!query) {
      return templateList;
    }
    const queryLower = query.toLowerCase();
    return templateList.filter(template => {
      return template.name.toLowerCase().includes(queryLower) ||
        template.displayText.toLowerCase().includes(queryLower);
    });
  }

  private fetchData(): void {
    if (!this.showIso) {
      this.templateList = [];
      this.templateService.getGroupedTemplates({}, ['featured', 'self'])
        .subscribe(templates => {
          let t = [];
          for (let filter in templates) {
            if (templates.hasOwnProperty(filter)) {
              t = t.concat(templates[filter]);
            }
          }
          this.templateList = t;
          this.filterResults(this.query);
        });
    } else {
      this.templateList = [];
      Observable.forkJoin([
        this.isoService.getList({ isofilter: 'featured' }),
        this.isoService.getList({ isofilter: 'self' }),
      ])
        .subscribe(([featuredIsos, selfIsos]) => {
          this.templateList = featuredIsos.concat(selfIsos);
          this.filterResults(this.query);
        });
    }
  }
}
