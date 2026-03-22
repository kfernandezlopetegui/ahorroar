import { TestBed } from '@angular/core/testing';

import { Coupons } from './coupons';

describe('Coupons', () => {
  let service: Coupons;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Coupons);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
