import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Definimos los orígenes que necesitamos
  const allowedOrigins = [
    'http://localhost:8100', // Para desarrollo en el navegador
    'http://localhost',      // Para Capacitor en Android
    'capacitor://localhost'  // Para Capacitor en iOS (por si acaso)
  ];

  // Si tienes una URL en Render para el frontend, agrégala aquí también
  if (process.env.CORS_ORIGIN) {
    allowedOrigins.push(process.env.CORS_ORIGIN);
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Permitimos si el origen está en la lista o si no hay origen (como Postman)
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('No permitido por CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();