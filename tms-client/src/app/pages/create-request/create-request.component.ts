import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { DashboardLayoutComponent } from '../../components/layout/dashboard-layout.component';
import { CreateRequestPayload, FieldResponse, RequestResponse, RequestTypeResponse } from '../../models';
import { DataService } from '../../services/data.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-create-request',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    DashboardLayoutComponent,
  ],
  templateUrl: './create-request.component.html',
  animations: [
    trigger('pageAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
  ],
})
export class CreateRequestComponent implements OnInit, OnDestroy {
  requestTypes: RequestTypeResponse[] = [];
  selectedType: RequestTypeResponse | null = null;
  dynamicForm: FormGroup;
  isLoading = true;
  isSubmitting = false;
  isEditMode = false;
editRequestId: number | null = null;
existingRequest: RequestResponse | null = null;
  private destroy$ = new Subject<void>();

  typeIcons: Record<string, string> = {
    'Laptop Request': 'laptop',
    'Software Access Request': 'apps',
    'Reimbursement Request': 'receipt_long',
    'Leave Request': 'event_busy',
    'WFH Request': 'home_work',
  };

  constructor(
    private fb: FormBuilder,
    private dataService: DataService,
    private toast: ToastService,
    private router: Router,
    private dialog: MatDialog,
      private route: ActivatedRoute 
  ) {
    this.dynamicForm = this.fb.group({
      fields: this.fb.array([]),
    });
  }

ngOnInit(): void {
 const idParam = this.route.snapshot.paramMap.get('id');
const fullUrl = this.router.url;
this.isEditMode = fullUrl.includes('/edit');
this.editRequestId = idParam ? +idParam : null;

  this.dataService.getAllRequestTypes()
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (types) => {
        this.requestTypes = types.filter((t) => t.isActive);

        // If edit mode, load the existing request and pre-fill
        if (this.isEditMode && this.editRequestId) {
          this.dataService.getRequestById(this.editRequestId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (req) => {
                this.existingRequest = req;
                const matchedType = this.requestTypes.find(
                  t => t.requestTypeId === req.requestTypeId
                );
                if (matchedType) {
                  this.selectedType = matchedType;
                  this.buildDynamicForm(matchedType.fields);
                  // Pre-fill field values
                  this.fieldsArray.controls.forEach(ctrl => {
                    const fieldId = ctrl.get('fieldId')?.value;
                    const existing = req.fieldValues.find(fv => fv.fieldId === fieldId);
                    if (existing) {
                      ctrl.get('value')?.setValue(existing.fieldValue);
                    }
                  });
                }
                this.isLoading = false;
              },
              error: () => {
                this.isLoading = false;
                this.toast.error('Failed to load request');
              },
            });
        } else {
          this.isLoading = false;
        }
      },
      error: () => {
        this.isLoading = false;
        this.toast.error('Failed to load request types');
      },
    });
}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get fieldsArray(): FormArray {
    return this.dynamicForm.get('fields') as FormArray;
  }

  selectType(type: RequestTypeResponse): void {
    this.selectedType = type;
    this.buildDynamicForm(type.fields);
  }

  isTypeSelected(index: number): boolean {
    if (!this.selectedType || !this.requestTypes[index]) return false;
    return this.selectedType.requestTypeId === this.requestTypes[index].requestTypeId;
  }

  private buildDynamicForm(fields: FieldResponse[]): void {
    const fieldsArr = this.fb.array(
      fields
        .filter((f) => f.isActive)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((field) => {
          const validators = field.isRequired ? [Validators.required] : [];
          return this.fb.group({
            fieldId: [field.fieldId],
            fieldLabel: [field.fieldLabel],
            fieldName: [field.fieldName],
            fieldType: [field.fieldType],
            isRequired: [field.isRequired],
            options: [field.options ?? ''],
            value: ['', validators],
          });
        })
    );
    this.dynamicForm = this.fb.group({ fields: fieldsArr });
  }

getFieldOptions(options: string): string[] {
  if (!options) return [];
  return options.split(',').map(o => o.trim()).filter(o => o.length > 0);
}

  getTypeIcon(name: string): string {
    return this.typeIcons[name] ?? 'description';
  }

  goBackToTypes(): void {
    this.selectedType = null;
  }

submitRequest(): void {
  if (this.dynamicForm.invalid || !this.selectedType) {
    this.dynamicForm.markAllAsTouched();
    return;
  }
  this.isSubmitting = true;
  const payload = this.buildPayload();

  if (this.isEditMode && this.editRequestId) {
    // Edit mode — call update then submit
 this.dataService.editRequest(this.editRequestId, payload)
  .pipe(
    takeUntil(this.destroy$),
    switchMap((result) =>
      this.dataService.submitRequest(result.requestId).pipe(
        map(() => result.requestId),
        catchError(() => of(result.requestId))
      )
    )
  )
  .subscribe({
    next: (requestId) => {
      this.toast.success('Request updated and submitted');
      this.router.navigate(['/requests', requestId]);
    },
    error: (err) => {
      this.isSubmitting = false;
      this.toast.error(err.error?.message || 'Failed to update request');
    },
  });
  }else {
  // Create draft first, then submit in one chain
  this.dataService.createRequest(payload)
    .pipe(
      takeUntil(this.destroy$),
      switchMap((result) => 
        this.dataService.submitRequest(result.requestId).pipe(
          map(() => result.requestId),
          catchError(() => of(result.requestId)) // submit failed but request created
        )
      )
    )
    .subscribe({
      next: (requestId) => {
        this.toast.success('Request submitted for approval');
        this.router.navigate(['/requests', requestId]);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.toast.error(err.error?.message || 'Failed to create request');
      },
    });
}
}

  saveDraft(): void {
  if (!this.selectedType) return;
  this.isSubmitting = true;
  const payload = this.buildPayload();

  if (this.isEditMode && this.editRequestId) {
    this.dataService.editRequest(this.editRequestId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.toast.success('Draft updated successfully');
          this.router.navigate(['/requests', result.requestId]);
        },
        error: (err) => {
          this.isSubmitting = false;
          this.toast.error(err.error?.message || 'Failed to update draft');
        },
      });
  } else {
    this.dataService.saveDraft(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.toast.success('Draft saved successfully');
          this.router.navigate(['/requests', result.requestId]);
        },
        error: (err) => {
          this.isSubmitting = false;
          this.toast.error(err.error?.message || 'Failed to save draft');
        },
      });
  }
}

  private buildPayload(): CreateRequestPayload {
    const fieldsData = this.fieldsArray.value as Array<{
      fieldId: number;
      value: string;
    }>;
    return {
      requestTypeId: this.selectedType!.requestTypeId,
      fieldValues: fieldsData.map((f) => ({
        fieldId: f.fieldId,
        fieldValue: f.value?.toString() ?? '',
      })),
    };
  }

  getWorkflowRoleIcon(roleName: string): string {
  const icons: Record<string, string> = {
    'Manager': 'manage_accounts',
    'IT': 'computer',
    'Finance': 'account_balance',
    'HR': 'people',
  };
  return icons[roleName] ?? 'person';
}
}
