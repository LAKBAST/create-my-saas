import { Expose, Transform } from 'class-transformer';
import { IsInt, IsOptional, Matches, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateCheckoutDto {
  @Expose()
  @Transform(({ value, obj }: { value: unknown; obj: { price_id?: unknown } }) => value ?? obj.price_id)
  @IsString()
  @IsNotEmpty()
  @Matches(/^price_[A-Za-z0-9]+$/)
  priceId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^price_[A-Za-z0-9]+$/)
  price_id?: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity = 1;
}
