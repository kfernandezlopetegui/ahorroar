import { Test, TestingModule } from '@nestjs/testing';
import { PreciosClarosController } from './precios-claros.controller';

describe('PreciosClarosController', () => {
  let controller: PreciosClarosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreciosClarosController],
    }).compile();

    controller = module.get<PreciosClarosController>(PreciosClarosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
