import { Test, TestingModule } from '@nestjs/testing';
import { PreciosClarosService } from './precios-claros.service';

describe('PreciosClarosService', () => {
  let service: PreciosClarosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PreciosClarosService],
    }).compile();

    service = module.get<PreciosClarosService>(PreciosClarosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
