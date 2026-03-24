import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Definimos los orígenes que necesitamos
  const allowedOrigins = [
    'http://localhost:8100', // Para desarrollo en el navegador
    'http://localhost', // Para Capacitor en Android
    'capacitor://localhost'// Para Capacitor en iOS (por si acaso)
  ];

  // Si tienes una URL en Render para el frontend, agrégala aquí también
  if (process.env.CORS_ORIGIN) {
    allowedOrigins.push(process.env.CORS_ORIGIN);
  }

  app.enableCors({
    origin: '*', // Esto elimina cualquier duda sobre el origen
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();