import type { Department, Doctor, HospitalProfile } from '@devmsr/validation';
import type { DepartmentRow, DoctorRow, HospitalProfileRow } from '../settings.repository.js';

export function toHospitalProfile(row: HospitalProfileRow): HospitalProfile {
  return { ...row };
}

export function toDepartment(row: DepartmentRow): Department {
  return { ...row };
}

export function toDoctor(row: DoctorRow): Doctor {
  return {
    id: row.id,
    fullName: row.fullName,
    qualification: row.qualification,
    registrationNumber: row.registrationNumber,
    departmentId: row.departmentId,
    departmentName: row.department.name,
    userId: row.userId,
    username: row.user?.username ?? null,
    isVisiting: row.isVisiting,
    isActive: row.isActive,
  };
}
