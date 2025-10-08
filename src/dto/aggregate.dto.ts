import { IsString, IsArray } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class AggregateSignatureDto {
  @ApiProperty({
    description: "Array of BLS signatures in hex format to aggregate",
    type: [String],
    example: [
      "0xafc696360a866979fb4b4e6757af4d1621616b5d928061be5aa2243c0b8ded9b12f8f3792399a62aa59fbcf7b3e4e1540b74054fd1bd02d6f1d83d35c472490c14d00fdcf2e1a40d7405714cb216f007531a8854fc50dd1c539b908cc50588a8",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    ],
  })
  @IsArray()
  @IsString({ each: true })
  signatures: string[];
}
